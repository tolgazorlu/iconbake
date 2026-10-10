import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

/** Drop zone + hidden file input that reads an image as a data URL with its natural size. */
export function useFileDrop(onFile: (dataUrl: string, w: number, h: number) => void) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handle = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      const img = new Image();
      img.onload = () => onFile(url, img.naturalWidth || 1024, img.naturalHeight || 1024);
      img.src = url;
    };
    r.readAsDataURL(file);
  };
  return {
    props: {
      className: `drop ${over ? "over" : ""}`,
      onClick: () => ref.current?.click(),
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files[0]);
      },
    },
    inputProps: {
      ref,
      type: "file" as const,
      accept: "image/*",
      onChange: (e: ChangeEvent<HTMLInputElement>) => handle(e.target.files?.[0]),
    },
  };
}
