import type { Href } from 'expo-router';

type EditorParams = { mode?: 'template'; templateId?: string; routineId?: string; clientId?: string };

// El parámetro `n` fuerza un formulario nuevo en cada visita, porque las pestañas no desmontan pantallas.
export function routineEditorHref(params: EditorParams = {}): Href {
  return {
    pathname: '/(main)/routine-create',
    params: { ...params, n: String(Date.now()) },
  } as Href;
}
