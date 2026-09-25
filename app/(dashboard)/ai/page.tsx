import ChatInterface from '@/components/ai/ChatInterface'
import InsightCards from '@/components/ai/InsightCards'

export default function AIPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Powered by Google Gemini — ask questions about your finances
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChatInterface />
        <InsightCards />
      </div>
    </div>
  )
}
