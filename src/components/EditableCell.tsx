import { useState, useEffect } from 'react';

interface EditableCellProps {
  value: number | string;
  displayValue?: number | string;
  onChange: (val: string) => void;
  rowIndex: number;
  colIndex: number;
  title?: string;
}

export const EditableCell = ({ value, displayValue, onChange, rowIndex, colIndex, title }: EditableCellProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState<string>(value ? String(value) : '');

  useEffect(() => {
    // When not actively editing, sync with raw value
    if (!isFocused) {
      setLocalValue(value ? String(value) : '');
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    setIsFocused(false);
    onChange(localValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setIsFocused(false);
      onChange(localValue);
      const nextRow = rowIndex + 1;
      const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${colIndex}"]`) as HTMLInputElement;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLocalValue(value ? String(value) : '');
    e.target.select();
  };

  // When focused: show raw user input. When blurred: show displayValue (normal hours) if provided
  const shownValue = isFocused
    ? localValue
    : (displayValue !== undefined ? (displayValue ? String(displayValue) : '') : localValue);

  return (
    <input
      type="text"
      value={shownValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      data-row={rowIndex}
      data-col={colIndex}
      title={title}
    />
  );
};
