import { Segmented } from '@/components/sirid';

/** Kept for existing call sites; renders the design system's animated segmented control. */
export function AdminPillToggle<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return <Segmented value={value} options={options} onChange={onChange} />;
}
