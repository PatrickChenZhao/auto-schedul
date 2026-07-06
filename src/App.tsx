import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileDown,
  FileUp,
  GripVertical,
  LayoutDashboard,
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
import {
  createEmptySchedule,
  createDefaultAvailability,
  createDefaultShiftTemplates,
  defaultAvailabilityEntry,
  defaultPreference,
  defaultShiftTemplates,
  getShiftTemplate,
  shiftColors,
  shiftLabels,
} from "./data";
import { ExcelExportMode, exportExcelSchedule, exportJsonBackup } from "./exporters";
import {
  deleteManualShift,
  generateWeeklyScheduleOptions,
  upsertManualShift,
} from "./scheduler";
import { calculateEmployeeStats } from "./stats";
import { loadAppState, normalizeAppState, saveAppState } from "./storage";
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

function App() {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [page, setPage] = useState<Page>("schedule");
  const [selectedDay, setSelectedDay] = useState<Day>("Monday");
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => getWeekMonday());
  const [warnings, setWarnings] = useState<ScheduleWarning[]>([]);
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOption[]>([]);
  const [selectedScheduleOptionId, setSelectedScheduleOptionId] = useState("");
  const [excelExportModalOpen, setExcelExportModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<ShiftAssignment | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    state.employees[0]?.id ?? "",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    if (!state.employees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(state.employees[0]?.id ?? "");
    }
  }, [selectedEmployeeId, state.employees]);

  const stats = useMemo(() => calculateEmployeeStats(state), [state]);

  const updateState = (recipe: (current: AppState) => AppState) => {
    setScheduleOptions([]);
    setSelectedScheduleOptionId("");
    setState((current) => recipe(current));
  };

  const runAutoSchedule = () => {
    const options = generateWeeklyScheduleOptions(state, 5);
    const bestOption = options[0];
    setScheduleOptions(options);
    setSelectedScheduleOptionId(bestOption?.id ?? "");
    setState((current) => ({
      ...current,
      schedule: bestOption?.schedule ?? createEmptySchedule(),
    }));
    setWarnings(
      bestOption?.warnings.length
        ? bestOption.warnings
        : [{ type: "fallback", message: "Schedule generated successfully." }],
    );
    setPage("schedule");
  };

  const clearScheduleOptions = () => {
    setScheduleOptions([]);
    setSelectedScheduleOptionId("");
  };

  const selectScheduleOption = (option: ScheduleOption) => {
    setSelectedScheduleOptionId(option.id);
    setState((current) => ({ ...current, schedule: option.schedule }));
    setWarnings(option.warnings);
  };

  const exportExcel = (mode: ExcelExportMode) => {
    exportExcelSchedule(state, mode, weekStartDate);
    setExcelExportModalOpen(false);
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = normalizeAppState(JSON.parse(text));
      clearScheduleOptions();
      setState(imported);
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
          <button className="ghost-button" onClick={() => exportJsonBackup(state)}>
            <FileDown size={16} />
            Export JSON
          </button>
          <button className="ghost-button" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={16} />
            Import JSON
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
            startManualSchedule={() => {
              clearScheduleOptions();
              setState((current) => ({
                ...current,
                schedule: createEmptySchedule(),
              }));
            }}
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
        />
      )}

      {addModalOpen && (
        <AddShiftModal
          state={state}
          day={selectedDay}
          onClose={() => setAddModalOpen(false)}
          onConfirm={(assignment) => {
            clearScheduleOptions();
            setState((current) => ({
              ...current,
              schedule: upsertManualShift(current.schedule, selectedDay, assignment),
            }));
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
            clearScheduleOptions();
            setState((current) => ({
              ...current,
              schedule: upsertManualShift(current.schedule, selectedDay, {
                ...editAssignment,
                shiftType,
              }),
            }));
            setEditAssignment(null);
          }}
          onDelete={() => {
            clearScheduleOptions();
            setState((current) => ({
              ...current,
              schedule: deleteManualShift(
                current.schedule,
                selectedDay,
                editAssignment.employeeId,
              ),
            }));
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
  startManualSchedule: () => void;
}) {
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

        <button className="add-shift-button" onClick={openAddModal}>
          <Plus size={17} />
          Add Employee Shift
        </button>
      </div>

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

    updateState((current) => ({
      ...current,
      employees: [...current.employees, employee],
      availability: {
        ...current.availability,
        ...createDefaultAvailability([employee]),
      },
      preferences: {
        ...current.preferences,
        [employee.id]: defaultPreference(employee),
      },
      specialSettings: {
        ...current.specialSettings,
        earlyAllowedEmployeeIds: [
          ...current.specialSettings.earlyAllowedEmployeeIds,
          employee.id,
        ],
      },
    }));
    setAddModalOpen(false);
  };

  const moveEmployee = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;

    updateState((current) => {
      const sourceIndex = current.employees.findIndex((employee) => employee.id === sourceId);
      const targetIndex = current.employees.findIndex((employee) => employee.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const employees = [...current.employees];
      const [movedEmployee] = employees.splice(sourceIndex, 1);
      employees.splice(targetIndex, 0, movedEmployee);

      return {
        ...current,
        employees,
      };
    });
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
                  updateState((current) => ({
                    ...current,
                    employees: current.employees.map((item) =>
                      item.id === employee.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  }))
                }
              />
              <select
                value={employee.type}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    employees: current.employees.map((item) =>
                      item.id === employee.id
                        ? {
                            ...item,
                            type: event.target.value as Employee["type"],
                          }
                        : item,
                    ),
                    preferences: {
                      ...current.preferences,
                      [employee.id]: {
                        ...current.preferences[employee.id],
                        maxDays:
                          event.target.value === "casual"
                            ? Math.min(current.preferences[employee.id]?.maxDays ?? 3, 3)
                            : current.preferences[employee.id]?.maxDays ?? 6,
                      },
                    },
                  }))
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
                    updateState((current) => ({
                      ...current,
                      employees: current.employees.map((item) =>
                        item.id === employee.id
                          ? { ...item, enabled: event.target.checked }
                          : item,
                      ),
                    }))
                  }
                />
                Enabled
              </label>
              <button
                className="icon-button danger"
                aria-label={`Delete ${employee.name}`}
                onClick={() =>
                  updateState((current) => {
                    const nextAvailability = { ...current.availability };
                    const nextPreferences = { ...current.preferences };
                    delete nextAvailability[employee.id];
                    delete nextPreferences[employee.id];
                    return {
                      ...current,
                      employees: current.employees.filter((item) => item.id !== employee.id),
                      availability: nextAvailability,
                      preferences: nextPreferences,
                      specialSettings: {
                        ...current.specialSettings,
                        earlyAllowedEmployeeIds:
                          current.specialSettings.earlyAllowedEmployeeIds.filter(
                            (id) => id !== employee.id,
                          ),
                      },
                      schedule: Object.fromEntries(
                        days.map((day) => [
                          day,
                          current.schedule[day].filter(
                            (assignment) => assignment.employeeId !== employee.id,
                          ),
                        ]),
                      ) as AppState["schedule"],
                    };
                  })
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
                      updateState((current) => ({
                        ...current,
                        availability: {
                          ...current.availability,
                          [selectedEmployeeId]: {
                            ...current.availability[selectedEmployeeId],
                            [day]: {
                              ...(current.availability[selectedEmployeeId]?.[day] ??
                                defaultAvailabilityEntry),
                              available: event.target.checked,
                            },
                          },
                        },
                      }))
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
                    updateState((current) => ({
                      ...current,
                      availability: {
                        ...current.availability,
                        [selectedEmployeeId]: {
                          ...current.availability[selectedEmployeeId],
                          [day]: {
                            ...(current.availability[selectedEmployeeId]?.[day] ??
                              defaultAvailabilityEntry),
                            start: event.target.value,
                          },
                        },
                      },
                    }))
                  }
                />
                <input
                  type="time"
                  step="900"
                  value={employeeAvailability[day]?.end ?? "23:00"}
                  disabled={!employeeAvailability[day]?.available}
                  onChange={(event) =>
                    updateState((current) => ({
                      ...current,
                      availability: {
                        ...current.availability,
                        [selectedEmployeeId]: {
                          ...current.availability[selectedEmployeeId],
                          [day]: {
                            ...(current.availability[selectedEmployeeId]?.[day] ??
                              defaultAvailabilityEntry),
                            end: event.target.value,
                          },
                        },
                      },
                    }))
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
    updateState((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        [selectedEmployeeId]: {
          ...current.preferences[selectedEmployeeId],
          ...patch,
        },
      },
    }));

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
    updateState((current) => ({
      ...current,
      shiftTemplates: {
        ...current.shiftTemplates,
        [day]: {
          ...current.shiftTemplates[day],
          [shiftType]: template,
        },
      },
    }));
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
                            updateState((current) => ({
                              ...current,
                              shiftDemand: {
                                ...current.shiftDemand,
                                [day]: {
                                  ...current.shiftDemand[day],
                                  [shiftType]: Number(event.target.value),
                                },
                              },
                            }))
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
            updateState((current) => ({
              ...current,
              shiftTemplates: createDefaultShiftTemplates(),
            }))
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
              updateState((current) => ({
                ...current,
                specialSettings: {
                  ...current.specialSettings,
                  priorityMode: "balance-first",
                },
              }))
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
              updateState((current) => ({
                ...current,
                specialSettings: {
                  ...current.specialSettings,
                  priorityMode: "binding-first",
                },
              }))
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
              updateState((current) => ({
                ...current,
                specialSettings: {
                  ...current.specialSettings,
                  priorityMode: "work-day-first",
                },
              }))
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
                updateState((current) => ({
                  ...current,
                  specialSettings: {
                    ...current.specialSettings,
                    shiftTypeCapEnabled: event.target.checked,
                  },
                }))
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
                  updateState((current) => ({
                    ...current,
                    specialSettings: {
                      ...current.specialSettings,
                      earlyAllowedEmployeeIds: event.target.checked
                        ? [
                            ...current.specialSettings.earlyAllowedEmployeeIds,
                            employee.id,
                          ]
                        : current.specialSettings.earlyAllowedEmployeeIds.filter(
                            (id) => id !== employee.id,
                          ),
                    },
                  }))
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

function ExcelExportModal({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (mode: ExcelExportMode) => void;
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
        <button className="excel-format-button" onClick={() => onExport("general")}>
          General
        </button>
        <button
          className="excel-format-button chapanda"
          onClick={() => onExport("chapanda")}
        >
          Chapanda
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

