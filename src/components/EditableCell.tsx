import { useState } from 'react';

interface EditableCellProps {
  value: number | string;
  displayValue?: number | string;
  onChange: (val: string) => void;
  rowIndex: number;
  colIndex: number;
  title?: string;
  ariaLabel?: string;
}

export const EditableCell = ({ value, displayValue, onChange, rowIndex, colIndex, title, ariaLabel }: EditableCellProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState<string>(value ? String(value) : '');

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
    : (displayValue !== undefined
      ? (displayValue ? String(displayValue) : '')
      : (value ? String(value) : ''));

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
      aria-label={ariaLabel}
    />
  );
};
