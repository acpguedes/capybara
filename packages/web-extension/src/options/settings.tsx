import { useState } from "react";

export function Settings(): JSX.Element {
  const [syncEnabled, setSyncEnabled] = useState(true);

  return (
    <section>
      <h2>Synchronization</h2>
      <label>
        <input
          type="checkbox"
          checked={syncEnabled}
          onChange={(event) => setSyncEnabled(event.target.checked)}
        />
        Enable automatic bookmark synchronization
      </label>
    </section>
  );
}
