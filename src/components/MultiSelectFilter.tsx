import { useEffect, useMemo, useRef, useState } from 'react';

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selectedValues: string[];
  placeholder: string;
  emptyMessage: string;
  onChange: (values: string[]) => void;
  getOptionLabel?: (value: string) => string;
  getOptionDescription?: (value: string) => string | null;
  getSummaryLabel?: (values: string[]) => string;
}

export default function MultiSelectFilter({
  label,
  options,
  selectedValues,
  placeholder,
  emptyMessage,
  onChange,
  getOptionLabel,
  getOptionDescription,
  getSummaryLabel,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const summary = useMemo(() => {
    if (selectedValues.length === 0) {
      return placeholder;
    }

    if (getSummaryLabel) {
      return getSummaryLabel(selectedValues);
    }

    if (selectedValues.length === 1) {
      return getOptionLabel ? getOptionLabel(selectedValues[0]) : selectedValues[0];
    }

    return `${selectedValues.length} selected`;
  }, [getOptionLabel, getSummaryLabel, placeholder, selectedValues]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((currentValue) => currentValue !== value));
      return;
    }

    onChange([...selectedValues, value]);
  };

  return (
    <div ref={rootRef} className={`multi-select ${open ? 'open' : ''}`}>
      <button
        className={`multi-select-trigger ${selectedValues.length > 0 ? 'has-value' : ''}`}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className="multi-select-trigger-label">{label}</span>
        <span className="multi-select-trigger-value" title={summary}>{summary}</span>
        {selectedValues.length > 0 && <span className="multi-select-count">{selectedValues.length}</span>}
        <span className="multi-select-chevron" aria-hidden="true">v</span>
      </button>

      {open && (
        <div className="multi-select-menu" role="listbox" aria-multiselectable="true">
          <div className="multi-select-menu-head">
            <span>{options.length} options</span>
            <button
              className="multi-select-clear"
              type="button"
              disabled={selectedValues.length === 0}
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>

          <div className="multi-select-options">
            {options.length === 0 ? (
              <div className="multi-select-empty">{emptyMessage}</div>
            ) : (
              options.map((option) => {
                const optionLabel = getOptionLabel ? getOptionLabel(option) : option;
                const optionDescription = getOptionDescription ? getOptionDescription(option) : null;
                const selected = selectedValues.includes(option);

                return (
                  <label key={option} className={`multi-select-option ${selected ? 'selected' : ''}`} title={option}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleValue(option)}
                    />
                    <span className="multi-select-option-copy">
                      <span className="multi-select-option-label">{optionLabel}</span>
                      {optionDescription && optionDescription !== optionLabel && (
                        <span className="multi-select-option-description">{optionDescription}</span>
                      )}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}