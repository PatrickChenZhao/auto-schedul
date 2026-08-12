import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Clock,
  Database,
  Download,
  FileDown,
  FileUp,
  GripVertical,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Plus,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePersistentAppState } from "./app/usePersistentAppState";
import { useScheduleWorkspace } from "./app/useScheduleWorkspace";
import { useCloudWorkspace } from "./cloud/useCloudWorkspace";
import { completeOfficialExcelExport } from "./cloud/officialExcelExport";
import {
  defaultShiftTemplates,
  getShiftTemplate,
  shiftColors,
  shiftLabels,
} from "./data";
import {
  downloadPreparedExcel,
  ExcelExportMode,
  exportJsonBackup,
  prepareExcelSchedule,
} from "./exporters";
import {
  HISTORY_RETENTION_LIMIT,
  type HistoryDetail,
  type HistoryListItem,
} from "./cloud/contracts";
import { calculateEmployeeStats } from "./stats";
import { normalizeAppState } from "./persistence/normalizeAppState";
import {
  addEmployeeToState,
  moveEmployeeInState,
  removeEmployeeFromState,
  renameEmployeeInState,
  resetShiftTemplatesInState,
  setEarlyShiftAllowedInState,
  setEmployeeEnabledInState,
  setEmployeeTypeInState,
  setPriorityModeInState,
  setShiftDemandInState,
  setShiftTemplateInState,
  setShiftTypeCapEnabledInState,
  updateAvailabilityInState,
  updatePreferenceInState,
} from "./settings/appStateActions";
import {
  AppState,
  Day,
  Employee,
  EmployeePreference,
  ScheduleWarning,
  ScheduleOption,
  ShiftAssignment,
  ShiftTemplate,
  ShiftType,
  days,
  shiftTypes,
} from "./types";
import { timeToMinutes, timelineEnd, timelineSlots, timelineStart } from "./time";

type Page =
  | "schedule"
  | "history"
  | "employees"
  | "availability"
  | "preferences"
  | "demand"
  | "special"
  | "system";

const navItems: Array<{
  page: Page;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { page: "schedule", label: "Schedule", icon: CalendarDays },
  { page: "history", label: "History", icon: History },
  { page: "employees", label: "Employee Management", icon: Users },
  { page: "availability", label: "Availability", icon: Clock },
  { page: "preferences", label: "Preferences", icon: Star },
  { page: "demand", label: "Shift Demand", icon: LayoutDashboard },
  { page: "special", label: "Special Settings", icon: SlidersHorizontal },
  { page: "system", label: "System Settings", icon: Settings },
];

const createId = () => `emp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const getEmployeeName = (state: AppState, employeeId: string) =>
  state.employees.find((employee) => employee.id === employeeId)?.name ?? "Unknown";

const shiftDisplayName = (shiftType: ShiftType) => shiftLabels[shiftType];

const getWeekMonday = (date = new Date()) => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
};

const addCalendarDays = (date: Date, daysToAdd: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  return nextDate;
};

const formatWeekDisplayDate = (date: Date) =>
  `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

const formatShiftTemplate = (template: ShiftTemplate) =>
  `${template.start}-${template.end}`;

const defaultShiftTemplateTooltip = [
  `周一到周四：早班 ${formatShiftTemplate(defaultShiftTemplates.Monday.early)}，中班 ${formatShiftTemplate(
    defaultShiftTemplates.Monday.mid,
  )}，晚班 ${formatShiftTemplate(defaultShiftTemplates.Monday.late)}。`,
  `周五到周日：早班 ${formatShiftTemplate(defaultShiftTemplates.Friday.early)}，中班 ${formatShiftTemplate(
    defaultShiftTemplates.Friday.mid,
  )}，晚班 ${formatShiftTemplate(defaultShiftTemplates.Friday.late)}。`,
].join("\n");

const autoCompleteTooltipText =
  "不修改已经录入的班次，自动补全其他剩余空班次";

export type CloudAuthState = {
  configured: true;
  pending: boolean;
  user: null | { id: string; name?: string | null; email?: string | null };
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

function App({ cloudAuth }: { cloudAuth?: CloudAuthState }) {
  const [state, setState] = usePersistentAppState();
  const [page, setPage] = useState<Page>("schedule");
  const [selectedDay, setSelectedDay] = useState<Day>("Monday");
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => getWeekMonday());
  const [excelExportModalOpen, setExcelExportModalOpen] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<ShiftAssignment | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    state.employees[0]?.id ?? "",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    warnings,
    setWarnings,
    scheduleOptions,
    selectedScheduleOptionId,
    updateState,
    replaceState,
    runAutoSchedule: generateAutoSchedule,
    selectScheduleOption,
    autoCompleteCurrentSchedule,
    startManualSchedule,
    upsertManualAssignment,
    changeManualAssignmentShift,
    deleteManualAssignment,
  } = useScheduleWorkspace(state, setState);
  const cloud = useCloudWorkspace({ auth: cloudAuth, state, setState });

  useEffect(() => {
    if (!state.employees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(state.employees[0]?.id ?? "");
    }
  }, [selectedEmployeeId, state.employees]);

  const stats = useMemo(() => calculateEmployeeStats(state), [state]);

  const runAutoSchedule = () => {
    generateAutoSchedule();
    setPage("schedule");
  };

  const exportExcel = async (mode: ExcelExportMode) => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const snapshot = structuredClone(state);
      const prepared = prepareExcelSchedule(snapshot, mode, weekStartDate);
      if (cloudAuth?.configured && !cloudAuth.user) {
        throw new Error("Please sign in with Google before exporting an official schedule.");
      }
      await completeOfficialExcelExport({
        prepared,
        saveHistory: cloudAuth?.configured
          ? () => cloud.createExportHistory(weekStartDate, mode, snapshot)
          : undefined,
        download: downloadPreparedExcel,
      });
      setExcelExportModalOpen(false);
      setWarnings([
        {
          type: "fallback",
          message: cloudAuth?.configured
            ? "History saved and Excel downloaded successfully."
            : "Excel downloaded. Cloud History is disabled in this environment.",
        },
      ]);
      if (cloudAuth?.configured) void cloud.refreshHistory();
    } catch (error) {
      setWarnings([
        {
          type: "missing",
          message:
            error instanceof Error
              ? `Excel was not downloaded: ${error.message}`
              : "Excel was not downloaded because History could not be saved.",
        },
      ]);
    } finally {
      setExportingExcel(false);
    }
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = normalizeAppState(JSON.parse(text));
      replaceState(imported);
      setWarnings([{ type: "fallback", message: "JSON backup imported successfully." }]);
      setPage("schedule");
    } catch (error) {
      setWarnings([
        {
          type: "missing",
          message:
            error instanceof Error
              ? `Import failed: ${error.message}`
              : "Import failed: invalid JSON file.",
        },
      ]);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src={`${import.meta.env.BASE_URL}chapanda.png`} alt="Auto Shift" />
          </div>
          <div>
            <strong>Auto Shift</strong>
            <span>Scheduler</span>
          </div>
        </div>

        <button className="auto-button" onClick={runAutoSchedule}>
          <Sparkles size={18} />
          Auto Schedule
        </button>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.page}
                className={page === item.page ? "nav-item active" : "nav-item"}
                onClick={() => setPage(item.page)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-tools">
          {cloudAuth?.configured && (
            <div className="cloud-account">
              {cloudAuth.user ? (
                <>
                  <div className="cloud-account-copy">
                    <strong>{cloudAuth.user.name || cloudAuth.user.email || "Signed in"}</strong>
                    <span
                      className={`sync-status ${cloud.syncStatus}`}
                      aria-live="polite"
                      title={cloud.syncStatus === "error" ? cloud.errorMessage : undefined}
                    >
                      <i aria-hidden="true" />
                      {cloud.syncStatus === "saving"
                        ? "Saving changes…"
                        : cloud.syncStatus === "error"
                          ? `Save failed: ${cloud.errorMessage || "Unknown error"}`
                          : cloud.syncStatus === "saved"
                            ? "All changes saved"
                            : "Cloud connected"}
                    </span>
                    {cloud.workspace && <small>{cloud.workspace.name}</small>}
                  </div>
                  <button className="ghost-button" onClick={() => void cloudAuth.signOut()}>
                    <LogOut size={16} />
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  className="ghost-button"
                  disabled={cloudAuth.pending}
                  onClick={() => void cloudAuth.signIn()}
                >
                  <LogIn size={16} />
                  {cloudAuth.pending ? "Checking login…" : "Sign in with Google"}
                </button>
              )}
            </div>
          )}
          <button className="ghost-button" onClick={() => exportJsonBackup(state)}>
            <FileDown size={16} />
            Export Data
          </button>
          <button className="ghost-button" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={16} />
            Import Data
          </button>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="application/json"
            onChange={importJson}
          />
        </div>
      </aside>

      <main className="main-content">
        {page === "schedule" && (
          <SchedulePage
            state={state}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            weekStartDate={weekStartDate}
            onPreviousWeek={() =>
              setWeekStartDate((current) => addCalendarDays(current, -7))
            }
            onNextWeek={() =>
              setWeekStartDate((current) => addCalendarDays(current, 7))
            }
            stats={stats}
            scheduleOptions={scheduleOptions}
            selectedScheduleOptionId={selectedScheduleOptionId}
            onSelectScheduleOption={selectScheduleOption}
            openAddModal={() => setAddModalOpen(true)}
            openEditModal={setEditAssignment}
            onAutoComplete={autoCompleteCurrentSchedule}
            startManualSchedule={startManualSchedule}
          />
        )}
        {page === "history" && (
          <HistoryPage
            cloudConfigured={Boolean(cloudAuth?.configured)}
            signedIn={Boolean(cloudAuth?.user)}
            items={cloud.historyItems}
            loading={cloud.historyLoading}
            onRefresh={cloud.refreshHistory}
            onLoadDetail={cloud.loadHistoryDetail}
            onDelete={cloud.removeHistory}
          />
        )}
        {page === "employees" && (
          <EmployeesPage state={state} updateState={updateState} />
        )}
        {page === "availability" && (
          <AvailabilityPage
            state={state}
            updateState={updateState}
            selectedEmployeeId={selectedEmployeeId}
            setSelectedEmployeeId={setSelectedEmployeeId}
          />
        )}
        {page === "preferences" && (
          <PreferencesPage
            state={state}
            updateState={updateState}
            selectedEmployeeId={selectedEmployeeId}
            setSelectedEmployeeId={setSelectedEmployeeId}
          />
        )}
        {page === "demand" && (
          <ShiftDemandPage state={state} updateState={updateState} />
        )}
        {page === "special" && (
          <SpecialSettingsPage state={state} updateState={updateState} />
        )}
        {page === "system" && (
          <SystemSettingsPage
            state={state}
            onExportJson={() => exportJsonBackup(state)}
            onImportJson={() => fileInputRef.current?.click()}
          />
        )}
      </main>

      {page === "schedule" && (
        <button className="floating-export" onClick={() => setExcelExportModalOpen(true)}>
          <Download size={18} />
          Export Excel
        </button>
      )}

      {excelExportModalOpen && (
        <ExcelExportModal
          onClose={() => setExcelExportModalOpen(false)}
          onExport={exportExcel}
          exporting={exportingExcel}
        />
      )}

      {cloud.migrationRequired && cloudAuth?.user && (
        <CloudMigrationModal
          onImport={() => cloud.initializeCloud("import-local")}
          onFresh={() => cloud.initializeCloud("fresh")}
          errorMessage={cloud.errorMessage}
        />
      )}

      {addModalOpen && (
        <AddShiftModal
          state={state}
          day={selectedDay}
          onClose={() => setAddModalOpen(false)}
          onConfirm={(assignment) => {
            upsertManualAssignment(selectedDay, assignment);
            setAddModalOpen(false);
          }}
        />
      )}

      {editAssignment && (
        <EditShiftModal
          assignment={editAssignment}
          employeeName={getEmployeeName(state, editAssignment.employeeId)}
          onClose={() => setEditAssignment(null)}
          onChangeShift={(shiftType) => {
            changeManualAssignmentShift(
              selectedDay,
              editAssignment,
              shiftType,
            );
            setEditAssignment(null);
          }}
          onDelete={() => {
            deleteManualAssignment(selectedDay, editAssignment.employeeId);
            setEditAssignment(null);
          }}
        />
      )}

      {warnings.length > 0 && (
        <WarningsModal warnings={warnings} onClose={() => setWarnings([])} />
      )}
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

function SchedulePage({
  state,
  selectedDay,
  setSelectedDay,
  weekStartDate,
  onPreviousWeek,
  onNextWeek,
  stats,
  scheduleOptions,
  selectedScheduleOptionId,
  onSelectScheduleOption,
  openAddModal,
  openEditModal,
  onAutoComplete,
  startManualSchedule,
}: {
  state: AppState;
  selectedDay: Day;
  setSelectedDay: (day: Day) => void;
  weekStartDate: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  stats: ReturnType<typeof calculateEmployeeStats>;
  scheduleOptions: ScheduleOption[];
  selectedScheduleOptionId: string;
  onSelectScheduleOption: (option: ScheduleOption) => void;
  openAddModal: () => void;
  openEditModal: (assignment: ShiftAssignment) => void;
  onAutoComplete: () => void;
  startManualSchedule: () => void;
}) {
  const [autoCompleteTooltipPosition, setAutoCompleteTooltipPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const assignments = state.schedule[selectedDay].filter((assignment) =>
    state.employees.some((employee) => employee.id === assignment.employeeId),
  ).sort((left, right) => {
    const leftRank = shiftTypes.indexOf(left.shiftType);
    const rightRank = shiftTypes.indexOf(right.shiftType);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return getEmployeeName(state, left.employeeId).localeCompare(
      getEmployeeName(state, right.employeeId),
    );
  });
  const timelineStartMinutes = timeToMinutes(timelineStart);
  const timelineMinutes = timeToMinutes(timelineEnd) - timelineStartMinutes;
  const weekEndDate = addCalendarDays(weekStartDate, 6);
  const showAutoCompleteTooltip = (target: HTMLButtonElement) => {
    const rect = target.getBoundingClientRect();
    setAutoCompleteTooltipPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 380)),
      top: rect.bottom + 8,
    });
  };

  return (
    <section>
      <PageHeader
        title="Schedule"
        subtitle="View one day at a time, edit shifts manually, and export the weekly result."
        actions={
          <div className="schedule-header-actions">
            {scheduleOptions.length > 0 && (
              <div className="schedule-option-picker" aria-label="Schedule options">
                {scheduleOptions.map((option, index) => (
                  <button
                    key={option.id}
                    className={selectedScheduleOptionId === option.id ? "active" : ""}
                    onClick={() => onSelectScheduleOption(option)}
                    title={
                      option.warnings.length
                        ? `${option.warnings.length} warning(s)`
                        : "No warnings"
                    }
                  >
                    {"\u65b9\u6848"} {index + 1}
                  </button>
                ))}
              </div>
            )}
            <button
              className="secondary-button manual-schedule-button"
              onClick={startManualSchedule}
            >
              手动排班
            </button>
          </div>
        }
      />

      <div className="schedule-controls">
        <div className="day-switcher">
          {days.map((day) => (
            <button
              key={day}
              className={selectedDay === day ? "day-button active" : "day-button"}
              onClick={() => setSelectedDay(day)}
            >
              {day}
            </button>
          ))}
        </div>

        <div className="week-picker" aria-label="Week date range">
          <button
            className="week-nav-button"
            type="button"
            onClick={onPreviousWeek}
            aria-label="Previous week"
            title="上一周"
          >
            <ChevronLeft size={18} />
            <span>上一周</span>
          </button>
          <div className="week-range">
            {formatWeekDisplayDate(weekStartDate)}
            <span>-</span>
            {formatWeekDisplayDate(weekEndDate)}
          </div>
          <button
            className="week-nav-button"
            type="button"
            onClick={onNextWeek}
            aria-label="Next week"
            title="下一周"
          >
            <span>下一周</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="panel schedule-panel">
        <div className="schedule-scroll">
          <div className="schedule-header-row">
            <div className="employee-column header-cell">Employee</div>
            <div className="time-header">
              {timelineSlots.map((time) => (
                <span key={time}>{time}</span>
              ))}
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="empty-state">No shifts scheduled for {selectedDay}.</div>
          ) : (
            assignments.map((assignment) => {
              const template = getShiftTemplate(
                selectedDay,
                assignment.shiftType,
                state.shiftTemplates,
              );
              const left =
                ((timeToMinutes(template.start) - timelineStartMinutes) / timelineMinutes) *
                100;
              const width =
                ((timeToMinutes(template.end) - timeToMinutes(template.start)) /
                  timelineMinutes) *
                100;

              return (
                <div className="schedule-row" key={assignment.employeeId}>
                  <div className="employee-column">
                    {getEmployeeName(state, assignment.employeeId)}
                    <span>{shiftDisplayName(assignment.shiftType)}</span>
                  </div>
                  <div className="timeline-track">
                    <div className="track-lines">
                      {timelineSlots.map((slot) => (
                        <span key={slot} />
                      ))}
                    </div>
                    <button
                      className="shift-block"
                      aria-label={`${getEmployeeName(
                        state,
                        assignment.employeeId,
                      )} ${shiftDisplayName(assignment.shiftType)}`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: shiftColors[assignment.shiftType],
                      }}
                      onClick={() => openEditModal(assignment)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="schedule-panel-actions">
          <button className="add-shift-button" onClick={openAddModal}>
            <Plus size={17} />
            Add Employee Shift
          </button>
          <button
            className="auto-complete-button"
            onClick={onAutoComplete}
            onBlur={() => setAutoCompleteTooltipPosition(null)}
            onFocus={(event) => showAutoCompleteTooltip(event.currentTarget)}
            onMouseEnter={(event) => showAutoCompleteTooltip(event.currentTarget)}
            onMouseLeave={() => setAutoCompleteTooltipPosition(null)}
          >
            <Sparkles size={17} />
            一键自动补全
          </button>
        </div>
      </div>

      {autoCompleteTooltipPosition && (
        <div
          className="floating-help-tooltip"
          style={{
            left: autoCompleteTooltipPosition.left,
            top: autoCompleteTooltipPosition.top,
          }}
        >
          {autoCompleteTooltipText}
        </div>
      )}

      <StatsTable stats={stats} />
    </section>
  );
}

function StatsTable({ stats }: { stats: ReturnType<typeof calculateEmployeeStats> }) {
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Employee Stats</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Early Count</th>
              <th>Mid Count</th>
              <th>Late Count</th>
              <th>Work Days</th>
              <th>Total Hours</th>
              <th>Count Hours</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.employeeId}>
                <td>{stat.employeeName}</td>
                <td>{stat.earlyCount}</td>
                <td>{stat.midCount}</td>
                <td>{stat.lateCount}</td>
                <td>{stat.workDays}</td>
                <td>{formatNumber(stat.totalHours)}</td>
                <td>{formatNumber(stat.countHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeesPage({
  state,
  updateState,
}: {
  state: AppState;
  updateState: (recipe: (current: AppState) => AppState) => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);

  const addEmployee = (name: string, type: Employee["type"], enabled: boolean) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const employee: Employee = {
      id: createId(),
      name: trimmedName,
      type,
      enabled,
    };

    updateState((current) => addEmployeeToState(current, employee));
    setAddModalOpen(false);
  };

  const moveEmployee = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;

    updateState((current) => moveEmployeeInState(current, sourceId, targetId));
  };

  return (
    <section>
      <PageHeader
        title="Employee Management"
        subtitle="Add staff, set employment type, and control whether they participate in scheduling."
      />
      <div className="panel">
        <div className="employee-toolbar">
          <button className="primary-button" onClick={() => setAddModalOpen(true)}>
            <Plus size={17} />
            Add Employee
          </button>
        </div>

        <div className="employee-list">
          {state.employees.map((employee) => (
            <div
              className={
                draggedEmployeeId === employee.id
                  ? "employee-item dragging"
                  : "employee-item"
              }
              key={employee.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId =
                  event.dataTransfer.getData("text/plain") || draggedEmployeeId;
                if (sourceId) moveEmployee(sourceId, employee.id);
                setDraggedEmployeeId(null);
              }}
            >
              <button
                className="icon-button drag-handle"
                aria-label={`Drag ${employee.name}`}
                draggable
                onDragStart={(event) => {
                  setDraggedEmployeeId(employee.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", employee.id);
                }}
                onDragEnd={() => setDraggedEmployeeId(null)}
              >
                <GripVertical size={17} />
              </button>
              <input
                value={employee.name}
                onChange={(event) =>
                  updateState((current) =>
                    renameEmployeeInState(current, employee.id, event.target.value),
                  )
                }
              />
              <select
                value={employee.type}
                onChange={(event) =>
                  updateState((current) =>
                    setEmployeeTypeInState(
                      current,
                      employee.id,
                      event.target.value as Employee["type"],
                    ),
                  )
                }
              >
                <option value="full-time">Formal</option>
                <option value="casual">Casual</option>
              </select>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={employee.enabled}
                  onChange={(event) =>
                    updateState((current) =>
                      setEmployeeEnabledInState(
                        current,
                        employee.id,
                        event.target.checked,
                      ),
                    )
                  }
                />
                Enabled
              </label>
              <button
                className="icon-button danger"
                aria-label={`Delete ${employee.name}`}
                onClick={() =>
                  updateState((current) => removeEmployeeFromState(current, employee.id))
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {addModalOpen && (
        <AddEmployeeModal
          onClose={() => setAddModalOpen(false)}
          onConfirm={addEmployee}
        />
      )}
    </section>
  );
}

function EmployeeSelector({
  employees,
  value,
  onChange,
}: {
  employees: Employee[];
  value: string;
  onChange: (employeeId: string) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {employees.map((employee) => (
        <option value={employee.id} key={employee.id}>
          {employee.name}
        </option>
      ))}
    </select>
  );
}

function AvailabilityPage({
  state,
  updateState,
  selectedEmployeeId,
  setSelectedEmployeeId,
}: {
  state: AppState;
  updateState: (recipe: (current: AppState) => AppState) => void;
  selectedEmployeeId: string;
  setSelectedEmployeeId: (id: string) => void;
}) {
  const employeeAvailability = state.availability[selectedEmployeeId];

  return (
    <section>
      <PageHeader
        title="Availability"
        subtitle="Set repeating weekly availability. Auto scheduling only assigns fully covered shifts."
      />
      <div className="panel settings-panel">
        <EmployeeSelector
          employees={state.employees}
          value={selectedEmployeeId}
          onChange={setSelectedEmployeeId}
        />
        {employeeAvailability && (
          <div className="availability-list">
            {days.map((day) => (
              <div className="availability-row" key={day}>
                <strong>{day}</strong>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={employeeAvailability[day]?.available ?? true}
                    onChange={(event) =>
                      updateState((current) =>
                        updateAvailabilityInState(current, selectedEmployeeId, day, {
                          available: event.target.checked,
                        }),
                      )
                    }
                  />
                  Available
                </label>
                <input
                  type="time"
                  step="900"
                  value={employeeAvailability[day]?.start ?? "09:45"}
                  disabled={!employeeAvailability[day]?.available}
                  onChange={(event) =>
                    updateState((current) =>
                      updateAvailabilityInState(current, selectedEmployeeId, day, {
                        start: event.target.value,
                      }),
                    )
                  }
                />
                <input
                  type="time"
                  step="900"
                  value={employeeAvailability[day]?.end ?? "23:00"}
                  disabled={!employeeAvailability[day]?.available}
                  onChange={(event) =>
                    updateState((current) =>
                      updateAvailabilityInState(current, selectedEmployeeId, day, {
                        end: event.target.value,
                      }),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PreferencesPage({
  state,
  updateState,
  selectedEmployeeId,
  setSelectedEmployeeId,
}: {
  state: AppState;
  updateState: (recipe: (current: AppState) => AppState) => void;
  selectedEmployeeId: string;
  setSelectedEmployeeId: (id: string) => void;
}) {
  const preference = state.preferences[selectedEmployeeId];
  const [coworkerId, setCoworkerId] = useState("");
  const [coworkerType, setCoworkerType] =
    useState<EmployeePreference["coworkers"][number]["type"]>("soft");
  const [coworkerModalOpen, setCoworkerModalOpen] = useState(false);
  const coworkers = state.employees.filter((employee) => employee.id !== selectedEmployeeId);

  useEffect(() => {
    if (coworkerId && !coworkers.some((employee) => employee.id === coworkerId)) {
      setCoworkerId("");
    }
  }, [coworkerId, coworkers]);

  const updatePreference = (patch: Partial<EmployeePreference>) =>
    updateState((current) =>
      updatePreferenceInState(current, selectedEmployeeId, patch),
    );

  if (!preference) {
    return (
      <section>
        <PageHeader title="Preferences" subtitle="Add an employee before setting preferences." />
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="Preferences"
        subtitle="Configure soft shift preferences, weekly targets, and coworker rules."
      />
      <div className="panel settings-panel">
        <EmployeeSelector
          employees={state.employees}
          value={selectedEmployeeId}
          onChange={setSelectedEmployeeId}
        />

        <div className="field-group">
          <label>Shift Preference</label>
          <div className="segmented-control">
            {(["early", "mid", "late", "any"] as const).map((option) => (
              <button
                key={option}
                className={preference.shiftPreference === option ? "active" : ""}
                onClick={() => updatePreference({ shiftPreference: option })}
              >
                {option === "any" ? "Any" : shiftLabels[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="checkbox-card preference-toggle">
            <input
              type="checkbox"
              checked={preference.refuseLateShift}
              onChange={(event) =>
                updatePreference({ refuseLateShift: event.target.checked })
              }
            />
            <span>Refuse Late Shift</span>
          </label>
        </div>

        <div className="two-column-form">
          <label>
            Minimum work days per week
            <input
              type="number"
              min="0"
              max="7"
              value={preference.minDays}
              onChange={(event) =>
                updatePreference({ minDays: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Maximum work days per week
            <input
              type="number"
              min="0"
              max="7"
              value={preference.maxDays}
              onChange={(event) =>
                updatePreference({ maxDays: Number(event.target.value) })
              }
            />
          </label>
        </div>

        <div className="field-group">
          <label>Coworker Preference</label>
          <div className="coworker-toolbar">
            <button className="primary-button" onClick={() => setCoworkerModalOpen(true)}>
              <Plus size={17} />
              Add
            </button>
          </div>
          <div className="preference-list">
            {preference.coworkers.length === 0 ? (
              <div className="muted">No coworker preferences set.</div>
            ) : (
              preference.coworkers.map((coworker) => (
                <div className="preference-item" key={coworker.coworkerId}>
                  <span>{getEmployeeName(state, coworker.coworkerId)}</span>
                  <strong>{coworker.type === "hard" ? "Hard Bind" : "Soft Preference"}</strong>
                  <button
                    className="icon-button"
                    onClick={() =>
                      updatePreference({
                        coworkers: preference.coworkers.filter(
                          (item) => item.coworkerId !== coworker.coworkerId,
                        ),
                      })
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {coworkerModalOpen && (
        <AddCoworkerPreferenceModal
          coworkers={coworkers}
          coworkerId={coworkerId}
          coworkerType={coworkerType}
          onChangeCoworkerId={setCoworkerId}
          onChangeCoworkerType={setCoworkerType}
          onClose={() => setCoworkerModalOpen(false)}
          onConfirm={() => {
            if (!coworkerId) return;
            updatePreference({
              coworkers: [
                ...preference.coworkers.filter(
                  (coworker) => coworker.coworkerId !== coworkerId,
                ),
                { coworkerId, type: coworkerType },
              ],
            });
            setCoworkerId("");
            setCoworkerModalOpen(false);
          }}
        />
      )}
    </section>
  );
}

function ShiftDemandPage({
  state,
  updateState,
}: {
  state: AppState;
  updateState: (recipe: (current: AppState) => AppState) => void;
}) {
  const [editingShiftTime, setEditingShiftTime] = useState<{
    day: Day;
    shiftType: ShiftType;
  } | null>(null);

  const updateShiftTemplate = (
    day: Day,
    shiftType: ShiftType,
    template: ShiftTemplate,
  ) => {
    updateState((current) =>
      setShiftTemplateInState(current, day, shiftType, template),
    );
    setEditingShiftTime(null);
  };

  return (
    <section>
      <PageHeader
        title="Shift Demand"
        subtitle="Define how many people each shift needs from Monday to Sunday."
      />
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Early</th>
                <th>Mid</th>
                <th>Late</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <td>{day}</td>
                  {shiftTypes.map((shiftType) => (
                    <td key={shiftType}>
                      <div className="demand-cell-control">
                        <input
                          className="number-cell"
                          type="number"
                          min="0"
                          value={state.shiftDemand[day][shiftType]}
                          onChange={(event) =>
                            updateState((current) =>
                              setShiftDemandInState(
                                current,
                                day,
                                shiftType,
                                Number(event.target.value),
                              ),
                            )
                          }
                        />
                        <button
                          className="shift-time-button"
                          type="button"
                          onClick={() => setEditingShiftTime({ day, shiftType })}
                          aria-label={`Set ${day} ${shiftLabels[shiftType]} time`}
                          title={`${formatShiftTemplate(
                            getShiftTemplate(day, shiftType, state.shiftTemplates),
                          )}`}
                        >
                          <Settings size={16} />
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="demand-footer-actions">
        <button
          className="secondary-button reset-default-button tooltip-target"
          type="button"
          data-tooltip={defaultShiftTemplateTooltip}
          onClick={() =>
            updateState((current) => resetShiftTemplatesInState(current))
          }
        >
          <RotateCcw size={17} />
          恢复默认值
        </button>
      </div>
      {editingShiftTime && (
        <ShiftTimeModal
          day={editingShiftTime.day}
          shiftType={editingShiftTime.shiftType}
          template={getShiftTemplate(
            editingShiftTime.day,
            editingShiftTime.shiftType,
            state.shiftTemplates,
          )}
          onClose={() => setEditingShiftTime(null)}
          onConfirm={(template) =>
            updateShiftTemplate(
              editingShiftTime.day,
              editingShiftTime.shiftType,
              template,
            )
          }
        />
      )}
    </section>
  );
}

function ShiftTimeModal({
  day,
  shiftType,
  template,
  onClose,
  onConfirm,
}: {
  day: Day;
  shiftType: ShiftType;
  template: ShiftTemplate;
  onClose: () => void;
  onConfirm: (template: ShiftTemplate) => void;
}) {
  const [start, setStart] = useState(template.start);
  const [end, setEnd] = useState(template.end);
  const isValidRange = timeToMinutes(start) < timeToMinutes(end);

  return (
    <Modal title={`${day} ${shiftLabels[shiftType]} 时间设置`} onClose={onClose}>
      <div className="modal-form">
        <div className="shift-time-summary">
          当前默认参考：{formatShiftTemplate(defaultShiftTemplates[day][shiftType])}
        </div>
        <div className="two-column-form modal-time-grid">
          <label>
            Start
            <input
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              onInput={(event) => setStart(event.currentTarget.value)}
            />
          </label>
          <label>
            End
            <input
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              onInput={(event) => setEnd(event.currentTarget.value)}
            />
          </label>
        </div>
        {!isValidRange && (
          <div className="inline-warning">结束时间必须晚于开始时间。</div>
        )}
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!isValidRange}
            onClick={() => onConfirm({ start, end })}
          >
            <Check size={17} />
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SpecialSettingsPage({
  state,
  updateState,
}: {
  state: AppState;
  updateState: (recipe: (current: AppState) => AppState) => void;
}) {
  const allowed = new Set(state.specialSettings.earlyAllowedEmployeeIds);

  return (
    <section>
      <PageHeader title="Special Settings" />
      <div className="panel settings-panel">
        <div className="special-section-title">
          <h2>Priorities</h2>
        </div>
        <div className="segmented-control priority-control">
          <button
            className={`tooltip-target ${
              state.specialSettings.priorityMode === "balance-first" ? "active" : ""
            }`}
            data-tooltip="优先让正式员工的班型和工时更平均。"
            onClick={() =>
              updateState((current) =>
                setPriorityModeInState(current, "balance-first"),
              )
            }
          >
            Balance First
          </button>
          <button
            className={`tooltip-target ${
              state.specialSettings.priorityMode === "binding-first" ? "active" : ""
            }`}
            data-tooltip="优先满足员工之间的绑定关系。"
            onClick={() =>
              updateState((current) =>
                setPriorityModeInState(current, "binding-first"),
              )
            }
          >
            Binding First
          </button>
          <button
            className={`tooltip-target ${
              state.specialSettings.priorityMode === "work-day-first" ? "active" : ""
            }`}
            data-tooltip="优先保证员工达到设置的最低工作天数，之后再考虑绑定关系、班型平衡和工时平衡。"
            onClick={() =>
              updateState((current) =>
                setPriorityModeInState(current, "work-day-first"),
              )
            }
          >
            Work-day First
          </button>
        </div>

        <div className="special-section-title">
          <h2>Safety Switches</h2>
        </div>
        <div className="checkbox-list">
          <label
            className="checkbox-card tooltip-target"
            data-tooltip={[
              "开启：同一员工同一班型最多 3 次，自动排班和优化调整都会遵守。",
              "关闭：取消这个保险限制，不再对超过 3 次做限制。",
              "默认开启，保持之前行为。",
            ].join("\n")}
          >
            <input
              type="checkbox"
              checked={state.specialSettings.shiftTypeCapEnabled}
              onChange={(event) =>
                updateState((current) =>
                  setShiftTypeCapEnabledInState(current, event.target.checked),
                )
              }
            />
            <span>班型上限保护</span>
          </label>
        </div>

        <div className="special-section-title">
          <h2>Allowed Early Shift Employees</h2>
        </div>
        <div className="checkbox-list">
          {state.employees.map((employee) => (
            <label className="checkbox-card" key={employee.id}>
              <input
                type="checkbox"
                checked={allowed.has(employee.id)}
                onChange={(event) =>
                  updateState((current) =>
                    setEarlyShiftAllowedInState(
                      current,
                      employee.id,
                      event.target.checked,
                    ),
                  )
                }
              />
              <span>{employee.name}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function SystemSettingsPage({
  state,
  onExportJson,
  onImportJson,
}: {
  state: AppState;
  onExportJson: () => void;
  onImportJson: () => void;
}) {
  return (
    <section>
      <PageHeader
        title="System Settings"
        subtitle="System settings will be added later."
      />
      <div className="panel settings-panel">
        <div className="empty-state compact">System settings will be added later.</div>
        <div className="system-actions">
          <button className="primary-button" onClick={onExportJson}>
            <FileDown size={17} />
            Export JSON
          </button>
          <button className="secondary-button" onClick={onImportJson}>
            <FileUp size={17} />
            Import JSON
          </button>
        </div>
        <div className="state-summary">
          <span>{state.employees.length} employees</span>
          <span>{days.reduce((sum, day) => sum + state.schedule[day].length, 0)} shifts</span>
        </div>
      </div>
    </section>
  );
}

function AddCoworkerPreferenceModal({
  coworkers,
  coworkerId,
  coworkerType,
  onChangeCoworkerId,
  onChangeCoworkerType,
  onClose,
  onConfirm,
}: {
  coworkers: Employee[];
  coworkerId: string;
  coworkerType: EmployeePreference["coworkers"][number]["type"];
  onChangeCoworkerId: (id: string) => void;
  onChangeCoworkerType: (type: EmployeePreference["coworkers"][number]["type"]) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Add Coworker Preference" onClose={onClose}>
      <div className="modal-form">
        <label>
          Employee
          <select
            value={coworkerId}
            onChange={(event) => onChangeCoworkerId(event.target.value)}
          >
            <option value="">无</option>
            {coworkers.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Binding
          <select
            value={coworkerType}
            onChange={(event) =>
              onChangeCoworkerType(
                event.target.value as EmployeePreference["coworkers"][number]["type"],
              )
            }
          >
            <option value="hard">Hard Bind</option>
            <option value="soft">Soft Preference</option>
          </select>
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={!coworkerId} onClick={onConfirm}>
            <Check size={17} />
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddEmployeeModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (name: string, type: Employee["type"], enabled: boolean) => void;
}) {
  const [name, setName] = useState("None");
  const [type, setType] = useState<Employee["type"]>("full-time");
  const [enabled, setEnabled] = useState(true);

  return (
    <Modal title="Add Employee" onClose={onClose}>
      <div className="modal-form">
        <label>
          Employee Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="None"
          />
        </label>
        <label>
          Employee Type
          <select
            value={type}
            onChange={(event) => setType(event.target.value as Employee["type"])}
          >
            <option value="full-time">Formal</option>
            <option value="casual">Casual</option>
          </select>
        </label>
        <label className="toggle-row modal-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enabled
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!name.trim()}
            onClick={() => onConfirm(name, type, enabled)}
          >
            <Check size={17} />
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddShiftModal({
  state,
  day,
  onClose,
  onConfirm,
}: {
  state: AppState;
  day: Day;
  onClose: () => void;
  onConfirm: (assignment: ShiftAssignment) => void;
}) {
  const availableEmployees = state.employees.filter(
    (employee) =>
      employee.enabled &&
      !state.schedule[day].some((assignment) => assignment.employeeId === employee.id),
  );
  const [employeeId, setEmployeeId] = useState(availableEmployees[0]?.id ?? "");
  const [shiftType, setShiftType] = useState<ShiftType>("early");

  return (
    <Modal title="Add Employee Shift" onClose={onClose}>
      {availableEmployees.length === 0 ? (
        <div className="empty-state compact">
          No enabled unscheduled employees are available for {day}.
        </div>
      ) : (
        <div className="modal-form">
          <label>
            Employee
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              {availableEmployees.map((employee) => (
                <option value={employee.id} key={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Shift
            <select
              value={shiftType}
              onChange={(event) => setShiftType(event.target.value as ShiftType)}
            >
              {shiftTypes.map((type) => (
                <option value={type} key={type}>
                  {shiftLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-button"
              onClick={() => onConfirm({ employeeId, shiftType })}
            >
              <Check size={17} />
              Confirm
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditShiftModal({
  assignment,
  employeeName,
  onClose,
  onChangeShift,
  onDelete,
}: {
  assignment: ShiftAssignment;
  employeeName: string;
  onClose: () => void;
  onChangeShift: (shiftType: ShiftType) => void;
  onDelete: () => void;
}) {
  return (
    <Modal title={`Change Shift: ${employeeName}`} onClose={onClose}>
      <div className="shift-choice-list">
        {shiftTypes.map((shiftType) => (
          <button
            key={shiftType}
            className={assignment.shiftType === shiftType ? "selected" : ""}
            onClick={() => onChangeShift(shiftType)}
          >
            <span
              style={{
                background: shiftColors[shiftType],
              }}
            />
            {shiftLabels[shiftType]}
          </button>
        ))}
      </div>
      <button className="delete-button" onClick={onDelete}>
        <Trash2 size={17} />
        Delete Shift
      </button>
    </Modal>
  );
}

function WarningsModal({
  warnings,
  onClose,
}: {
  warnings: ScheduleWarning[];
  onClose: () => void;
}) {
  const hasProblem = warnings.some((warning) => warning.type !== "fallback");

  return (
    <Modal title={hasProblem ? "Schedule Warnings" : "Schedule Message"} onClose={onClose}>
      <div className="warning-list">
        {warnings.map((warning, index) => (
          <div className={warning.type !== "fallback" ? "warning-item danger" : "warning-item"} key={`${warning.message}-${index}`}>
            <AlertTriangle size={17} />
            <span>{warning.message}</span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="primary-button" onClick={onClose}>
          OK
        </button>
      </div>
    </Modal>
  );
}

function HistoryPage({
  cloudConfigured,
  signedIn,
  items,
  loading,
  onRefresh,
  onLoadDetail,
  onDelete,
}: {
  cloudConfigured: boolean;
  signedIn: boolean;
  items: HistoryListItem[];
  loading: boolean;
  onRefresh: () => Promise<HistoryListItem[]>;
  onLoadDetail: (historyId: string) => Promise<HistoryDetail>;
  onDelete: (historyId: string) => Promise<void>;
}) {
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    void onRefresh().catch((refreshError) => {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to load History.");
    });
  }, [onRefresh, signedIn]);

  const openDetail = async (historyId: string) => {
    setDetailLoading(true);
    setError("");
    try {
      setDetail(await onLoadDetail(historyId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load History.");
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadHistoryExcel = () => {
    if (!detail) return;
    const [year, month, day] = detail.weekStart.split("-").map(Number);
    const snapshot: AppState = {
      ...detail.settingsSnapshot,
      schedule: detail.scheduleSnapshot.schedule,
    };
    downloadPreparedExcel(
      prepareExcelSchedule(snapshot, detail.format, new Date(year, month - 1, day)),
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete(deleteTarget.id);
      if (detail?.id === deleteTarget.id) setDetail(null);
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete History.");
    } finally {
      setDeleting(false);
    }
  };

  const detailTotalHours = detail?.stats.reduce((sum, stat) => sum + stat.totalHours, 0) ?? 0;
  const detailEmployeeCount = detail?.stats.filter((stat) => stat.workDays > 0).length ?? 0;

  if (!cloudConfigured) {
    return (
      <section>
        <PageHeader title="History" subtitle="History is available when Neon cloud sync is configured." />
        <div className="empty-state panel">Cloud History is disabled in this environment.</div>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section>
        <PageHeader title="History" subtitle="Sign in with Google to view exported schedules." />
        <div className="empty-state panel">Sign in from the sidebar to load History.</div>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="History"
        subtitle={`A record is created after an official Excel export. The newest ${HISTORY_RETENTION_LIMIT} records are retained.`}
        actions={
          <button className="secondary-button" disabled={loading} onClick={() => void onRefresh()}>
            <RotateCcw size={17} />
            Refresh
          </button>
        }
      />

      {error && <div className="cloud-error-banner">{error}</div>}

      <div className="history-layout">
        <div className="panel history-list-panel">
          <div className="panel-title"><h2>Excel Exports</h2></div>
          {loading && items.length === 0 ? (
            <div className="empty-state">Loading History…</div>
          ) : items.length === 0 ? (
            <div className="empty-state">No exported schedules yet.</div>
          ) : (
            <div className="history-list">
              {items.map((item) => (
                <button
                  key={item.id}
                  className={detail?.id === item.id ? "history-item active" : "history-item"}
                  onClick={() => void openDetail(item.id)}
                >
                  <strong>{item.weekStart} — {item.weekEnd}</strong>
                  <span>Revision {item.revision} · {item.format} · {item.assignmentCount} shifts</span>
                  <time>{new Date(item.createdAt).toLocaleString()}</time>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="history-detail-stack">
          {detailLoading ? (
            <div className="panel empty-state">Loading schedule snapshot…</div>
          ) : detail ? (
            <>
              <div className="panel">
                <div className="panel-title history-detail-title">
                  <div>
                    <h2>{detail.weekStart} — {detail.weekEnd}</h2>
                    <p>Saved {new Date(detail.createdAt).toLocaleString()}</p>
                  </div>
                  <button
                    className="delete-button"
                    disabled={deleting}
                    onClick={() => setDeleteTarget(detail)}
                  >
                    <Trash2 size={17} />
                    Delete
                  </button>
                  <button className="secondary-button" onClick={downloadHistoryExcel}>
                    <Download size={17} />
                    Download again
                  </button>
                </div>
                <div className="history-summary-grid">
                  <div className="history-summary-card">
                    <span>Export</span>
                    <strong>Revision {detail.revision}</strong>
                  </div>
                  <div className="history-summary-card">
                    <span>Format</span>
                    <strong>{detail.format === "general" ? "General" : "Chapanda"}</strong>
                  </div>
                  <div className="history-summary-card">
                    <span>Shifts / employees</span>
                    <strong>{detail.assignmentCount} / {detailEmployeeCount}</strong>
                  </div>
                  <div className="history-summary-card">
                    <span>Total hours</span>
                    <strong>{formatNumber(detailTotalHours)}</strong>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th><th>Day</th><th>Employee</th><th>Shift</th><th>Time</th><th>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.assignments.map((assignment) => (
                        <tr key={`${assignment.workDate}-${assignment.employeeId}`}>
                          <td>{assignment.workDate}</td>
                          <td>{assignment.day}</td>
                          <td>{assignment.employeeName}</td>
                          <td>{shiftLabels[assignment.shiftType]}</td>
                          <td>{assignment.startTime}-{assignment.endTime}</td>
                          <td>{formatNumber(assignment.calculatedHours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <StatsTable stats={detail.stats} />
            </>
          ) : (
            <div className="panel empty-state">Select an export to view its immutable snapshot.</div>
          )}
        </div>
      </div>
      {deleteTarget && (
        <Modal title="Delete History Record" onClose={() => !deleting && setDeleteTarget(null)}>
          <div className="modal-form">
            <p>
              Delete the export for {deleteTarget.weekStart} — {deleteTarget.weekEnd}? This also
              permanently deletes its saved shifts from the database.
            </p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="delete-button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                <Trash2 size={17} />
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function CloudMigrationModal({
  onImport,
  onFresh,
  errorMessage,
}: {
  onImport: () => Promise<void> | void;
  onFresh: () => Promise<void> | void;
  errorMessage: string;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal cloud-migration-modal" role="dialog" aria-modal="true" aria-label="First cloud setup">
        <div className="modal-header migration-header">
          <div className="migration-title">
            <span><Cloud size={15} /> Neon cloud sync</span>
            <h2>Set up your workspace</h2>
          </div>
        </div>
        <div className="migration-body">
          <p>
            Choose how to initialise this workspace. Your saved configuration will sync automatically
            after setup.
          </p>
          <div className="migration-points">
            <div>
              <Database size={18} />
              <span><strong>Import this browser</strong> keeps your employees, availability and roster settings.</span>
            </div>
            <div>
              <History size={18} />
              <span><strong>Your current schedule stays local</strong> and is only added to History after an Excel export.</span>
            </div>
          </div>
          {errorMessage && <div className="cloud-error-banner">{errorMessage}</div>}
          <div className="modal-actions migration-actions">
            <button className="secondary-button" disabled={busy} onClick={() => void run(onFresh)}>
              Start with defaults
            </button>
            <button className="primary-button" disabled={busy} onClick={() => void run(onImport)}>
              {busy ? "Importing…" : "Import this browser"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExcelExportModal({
  onClose,
  onExport,
  exporting,
}: {
  onClose: () => void;
  onExport: (mode: ExcelExportMode) => Promise<void> | void;
  exporting: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="excel-export-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose Excel export format"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="excel-format-button" disabled={exporting} onClick={() => void onExport("general")}>
          {exporting ? "Saving History…" : "General"}
        </button>
        <button
          className="excel-format-button chapanda"
          disabled={exporting}
          onClick={() => void onExport("chapanda")}
        >
          {exporting ? "Please wait…" : "Chapanda"}
        </button>
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default App;
