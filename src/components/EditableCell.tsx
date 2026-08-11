import { useState, useEffect } from 'react';

interface EditableCellProps {
  value: number | string;
  onChange: (val: string) => void;
  rowIndex: number;
  colIndex: number;
}

export const EditableCell = ({ value, onChange, rowIndex, colIndex }: EditableCellProps) => {
  const [localValue, setLocalValue] = useState<string>(value ? String(value) : '');

  useEffect(() => {
    // Sync local state with prop changes from parent
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalValue(value ? String(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    onChange(localValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const nextRow = rowIndex + 1;
      const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${colIndex}"]`) as HTMLInputElement;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      data-row={rowIndex}
      data-col={colIndex}
    />
  );
};
