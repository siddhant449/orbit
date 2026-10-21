import { domAnimation } from "motion/react";

/** Motion feature bundle, loaded lazily by `MotionProvider` (ruling U7) so it stays out of the first-load JS. */
export default domAnimation;
