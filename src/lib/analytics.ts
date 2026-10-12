/**
 * Microsoft Clarity, loaded only when VITE_CLARITY_ID is set at build time. Forks and local
 * builds therefore send nothing; the deployed site sets the id in its environment.
 */
export function loadClarity(id = import.meta.env.VITE_CLARITY_ID) {
  if (!id || !/^[a-z0-9]+$/i.test(id) || typeof document === "undefined") return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(s);
}
