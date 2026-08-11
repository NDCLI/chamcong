import { useState, useEffect } from 'react';
import { fmt, pf } from '../logic';

interface EditableCurrencyProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const EditableCurrency = ({ value, onChange, className, style }: EditableCurrencyProps) => {
  const [localValue, setLocalValue] = useState<string>(value ? fmt(value) : '');

  useEffect(() => {
    // Sync local state with prop changes from parent
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalValue(value ? fmt(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    const parsed = pf(localValue);
    onChange(parsed);
    setLocalValue(parsed ? fmt(parsed) : '');
  };

  return (
    <input
      type="text"
      className={className}
      style={style}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};
