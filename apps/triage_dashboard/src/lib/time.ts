import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export const getRelativeTime = (time: number) => {
  return dayjs(time).fromNow();
};

export const getDateTime = (time: number) => {
  return `${dayjs(time).format("MMMM D, YYYY")} at ${dayjs(time).format(
    "h:mm A",
  )}`;
};

export default dayjs;
