export const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const minutesToTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

export const getHoursBetween = (start: string, end: string) =>
  (timeToMinutes(end) - timeToMinutes(start)) / 60;

export const timelineStart = "09:45";
export const timelineEnd = "23:00";
export const timelineStepMinutes = 15;

export const timelineSlots = Array.from(
  {
    length:
      (timeToMinutes(timelineEnd) - timeToMinutes(timelineStart)) /
      timelineStepMinutes,
  },
  (_, index) =>
    minutesToTime(timeToMinutes(timelineStart) + index * timelineStepMinutes),
);
