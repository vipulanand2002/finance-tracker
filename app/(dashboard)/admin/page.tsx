'use client'

import { useEffect, useState } from 'react'
import { Bug, ShieldCheck } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AccessRequests from '@/components/admin/AccessRequests'
import BugNotebook from '@/components/admin/BugNotebook'

export default function AdminPage() {
  const [pending, setPending] = useState(0)
  const [tab, setTab] = useState('access')

  // Land on the notebook when the link asks for it (…/admin#bugs)
  useEffect(() => {
    Promise.resolve().then(() => { if (window.location.hash === '#bugs') setTab('bugs') })
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-muted-foreground text-sm">Approve new users and keep track of bugs to fix</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="access"><ShieldCheck className="w-4 h-4 mr-1.5" /> Access requests{pending > 0 ? ` (${pending})` : ''}</TabsTrigger>
          <TabsTrigger value="bugs"><Bug className="w-4 h-4 mr-1.5" /> Bug notebook</TabsTrigger>
        </TabsList>
        <TabsContent value="access" className="mt-4"><AccessRequests onPendingCount={setPending} /></TabsContent>
        <TabsContent value="bugs" className="mt-4"><BugNotebook /></TabsContent>
      </Tabs>
    </div>
  )
}
