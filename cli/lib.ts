// The app's own icon modules, bundled into the CLI so exports match the UI byte for byte.
import { DEFAULT_STATE } from "../src/lib/types";
import { PRESETS } from "../src/lib/presets";
import { collectFiles, setRasterizer } from "../src/lib/export";
import { compose } from "../src/lib/compose";
import type { Lib } from "../plugins/export-core.ts";

export const lib = { DEFAULT_STATE, PRESETS, collectFiles, setRasterizer, compose } as unknown as Lib;
