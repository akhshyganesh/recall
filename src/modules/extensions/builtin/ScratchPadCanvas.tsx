type Props = {
  storageKey: string;
};

export default function ScratchPadCanvas({ storageKey }: Props) {
  const theme =
    document.documentElement.classList.contains("dark") ? "dark" : "light";
  const src = `/excalidraw-frame/index.html?key=${encodeURIComponent(storageKey)}&theme=${theme}`;
  return (
    <iframe
      src={src}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
      title="Excalidraw canvas"
    />
  );
}
