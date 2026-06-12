import React from "react";

export function ExtensionBackground({ render }: { render: () => React.ReactNode }) {
  return <>{render()}</>;
}
