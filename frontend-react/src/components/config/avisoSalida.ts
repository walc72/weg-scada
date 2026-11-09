// Registro de módulo: cada useEdicion informa si tiene cambios sin guardar.
const registro = new Map<string, () => boolean>()

export const registrar = (id: string, sucio: () => boolean) => { registro.set(id, sucio) }
export const desregistrar = (id: string) => { registro.delete(id) }
export const haySinGuardar = () => [...registro.values()].some(f => f())
