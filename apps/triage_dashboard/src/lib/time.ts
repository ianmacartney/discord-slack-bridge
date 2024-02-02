import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export const getRelativeTime = (time: string) => {
  return dayjs(time).fromNow();
};

export const getDateTime = (time: string) => {
  return `${dayjs(time).format("MMMM D, YYYY")} at ${dayjs(time).format(
    "H:MM A",
  )}`;
};

export default dayjs;
