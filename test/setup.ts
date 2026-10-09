import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });
// Tells React the tests wrap updates in `act`.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
