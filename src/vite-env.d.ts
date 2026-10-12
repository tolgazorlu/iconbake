/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Iconify API base URL; set only for the static deployment. */
  readonly VITE_ICONIFY_API?: string;
  /** Microsoft Clarity project id; analytics load only when set. */
  readonly VITE_CLARITY_ID?: string;
}
