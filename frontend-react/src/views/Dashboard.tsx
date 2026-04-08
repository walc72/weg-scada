import { useEffect } from 'react'
import { useDrivesStore } from '../store/drives'
import Banner from '../components/Banner'
import DriveCard from '../components/DriveCard'
import PM8000Card from '../components/PM8000Card'
import { Loader2 } from 'lucide-react'

export default function Dashboard() {
  const connect = useDrivesStore((s) => s.connect)
  const disconnect = useDrivesStore((s) => s.disconnect)
  const driveList = useDrivesStore((s) => s.driveList())
  const meterList = useDrivesStore((s) => s.meterList())
  const stats = useDrivesStore((s) => s.stats())
  const connected = useDrivesStore((s) => s.connected)

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <Banner stats={stats} connected={connected} />

      {meterList.map((m) => <PM8000Card key={m.name} m={m} />)}

      {driveList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
          {driveList.map((d) => <DriveCard key={d.name} d={d} />)}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-16">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
          Esperando datos de drives...
        </div>
      )}
    </div>
  )
}
