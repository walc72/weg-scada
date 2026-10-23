import { create } from 'zustand'
import type { BackupInfo, BackupParte, BackupRun } from '../types'
import { apiJson } from '../lib/api'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

interface BackupState {
  info: BackupInfo | null
  load: () => Promise<void>
}

// GET /api/backup lo comparten la pestaña y el aviso de la App
export const useBackup = create<BackupState>((set) => ({
  info: null,
  load: async () => {
    try { set({ info: await backupApi<BackupInfo>('') }) } catch { /* sin backend o sin permiso: queda lo anterior */ }
  },
}))

// Llamada a /api/backup<path>; en modo demo responde el mock local
export function backupApi<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (MODE === 'mock') return mock(path, method, body as any) as Promise<T>
  return apiJson<T>(`/backup${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
}

// ─── Modo demo ───
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace(/\.\d+Z$/, 'Z')
const H = 3600e3
const run = (parte: BackupParte, msAgo: number, bytes: number, sftp: string): BackupRun => ({
  parte, inicio: iso(msAgo), fin: iso(msAgo - (parte === 'config' ? 4e3 : 95e3)), ok: sftp === 'ok',
  archivo: `weg-demo-${parte}.tar.gz.enc`, bytes, cifrado: true, destinos: { local: 'ok', drive: 'ok', sftp },
})
const SFTP_ERR = 'error no se pudo conectar a 192.168.10.50:22'
const runs: BackupRun[] = [run('config', 2 * H, 184_320, 'ok'), run('historico', 3 * H, 1_843_200_000, SFTP_ERR)]
for (let d = 1; d <= 6; d++) runs.push(run('config', d * 24 * H + 2 * H, 180_000 + d * 900, 'ok'), run('historico', d * 24 * H + 3 * H, 1_800_000_000 - d * 5e6, 'ok'))

const M: BackupInfo = {
  modulo: true,
  config: { frecuencia: 'diaria', hora: '02:00', copias: 14 },
  historico: { frecuencia: 'semanal', hora: '03:00', copias: 4 },
  drive: { activo: true, cuenta: 'planta@example.com', conectado: true, disponible: true },
  sftp: { activo: true, host: '192.168.10.50', puerto: 22, usuario: 'backup', carpeta: '/srv/backups', huella: 'SHA256:q3B1n9cJx0demoDEMOdemo0Hc7wq5tKk', clavePublica: null },
  fraseConfigurada: true,
  estado: {
    enCurso: null,
    ultima: { config: runs[0], historico: runs[1] },
    proxima: { config: iso(-22 * H), historico: iso(-4 * 24 * H) },
    historial: runs,
  },
}
let drivePolls = 0

async function mock(path: string, method: string, body: any): Promise<unknown> {
  await new Promise(r => setTimeout(r, 300))
  const key = `${method} ${path}`
  if (key === 'GET ') return structuredClone(M)
  if (key === 'PUT ') {
    for (const k of ['config', 'historico'] as const) if (body[k]) M[k] = { ...M[k]!, ...body[k] }
    if (body.drive) M.drive = { ...M.drive!, ...body.drive }
    if (body.sftp) {
      const otro = (body.sftp.host ?? M.sftp!.host) !== M.sftp!.host || (body.sftp.puerto ?? M.sftp!.puerto) !== M.sftp!.puerto
      M.sftp = { ...M.sftp!, ...body.sftp, ...(otro ? { huella: null } : {}) } // como la API: la huella vale para un host:puerto
    }
    return { ok: true }
  }
  if (key === 'PUT /frase') { const habia = M.fraseConfigurada; M.fraseConfigurada = true; return habia ? { ok: true, aviso: 'Los backups anteriores siguen necesitando la frase anterior' } : { ok: true } }
  if (key === 'POST /ahora') {
    const partes: BackupParte[] = body.partes
    M.estado!.enCurso = { parte: partes[0], desde: iso(0) }
    setTimeout(() => {
      for (const p of partes) { const r = run(p, 0, p === 'config' ? 185_000 : 1_850_000_000, 'ok'); M.estado!.ultima[p] = r; M.estado!.historial = [r, ...M.estado!.historial].slice(0, 30) }
      M.estado!.enCurso = null
    }, 7000)
    return { ok: true }
  }
  if (key === 'POST /drive/probar') return { destino: 'drive', ts: Date.now(), ok: true }
  if (key === 'POST /sftp/probar') return M.sftp!.huella ? { destino: 'sftp', ts: Date.now(), ok: true } : { destino: 'sftp', ts: Date.now(), ok: false, huella: 'SHA256:nuevaDEMOhuella0xYz', error: 'Falta aceptar la huella del equipo' }
  if (key === 'POST /sftp/huella') { M.sftp!.huella = body.huella; return { ok: true } }
  if (key === 'POST /sftp/clave') { M.sftp!.clavePublica = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoDemoDemoDemoDemoDemoDemoDemoDemo weg-scada-demo'; return { clavePublica: M.sftp!.clavePublica } }
  if (key === 'POST /drive/conectar') { drivePolls = 0; return { userCode: 'WDJB-MJHT', verificationUrl: 'https://www.google.com/device' } }
  if (key === 'GET /drive/conectar') {
    if (++drivePolls < 3) return { estado: 'pendiente', userCode: 'WDJB-MJHT', verificationUrl: 'https://www.google.com/device' }
    M.drive = { ...M.drive!, conectado: true, cuenta: 'planta@example.com' }
    return { estado: 'conectado', cuenta: 'planta@example.com' }
  }
  if (key === 'POST /drive/desconectar') { M.drive = { ...M.drive!, conectado: false, cuenta: null, activo: false }; return { ok: true } }
  throw new Error(`Demo: ${key} no simulado`)
}
