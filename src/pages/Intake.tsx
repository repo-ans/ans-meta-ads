import { Card } from '../components/ui'
import { IntakeForm } from '../components/IntakeForm'

// Public, standalone. New-client mode only — no campaign fields here.
export default function Intake() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Let's get started</h1>
        <p className="mt-1 text-slate-600">
          Tell us about your business. We'll set up your account and reach out with
          next steps — usually within a business day.
        </p>
      </div>
      <Card className="p-6">
        <IntakeForm />
      </Card>
      <p className="mt-4 text-center text-xs text-slate-400">
        Your information is only used to set up your advertising account.
      </p>
    </div>
  )
}
