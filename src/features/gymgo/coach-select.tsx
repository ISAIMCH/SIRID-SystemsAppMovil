import { useEffect, useState } from 'react';

import { api } from './api';
import type { DirectoryClient } from './directory-types';
import { SelectField, type SelectOption } from './select-field';

export function useCoachOptions() {
  const [options, setOptions] = useState<SelectOption[]>([]);
  useEffect(() => {
    let isCurrent = true;
    api.get<{ users: DirectoryClient[] }>('/auth/users', { params: { role: 'Coach' } })
      .then((response) => {
        if (!isCurrent) return;
        setOptions(response.data.users.filter((coach) => coach.isActive).map((coach) => ({ value: coach.id, label: `${coach.name} - ${coach.email}` })));
      })
      .catch(() => {
        if (isCurrent) setOptions([]);
      });
    return () => { isCurrent = false; };
  }, []);
  return options;
}

export function CoachSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = useCoachOptions();
  return (
    <SelectField
      label="Coach asignado (opcional)"
      placeholder="Sin Coach"
      clearLabel="Sin Coach"
      emptyText="Aún no hay Coaches registrados."
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
