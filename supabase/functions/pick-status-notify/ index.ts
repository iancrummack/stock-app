// supabase/functions/pick-status-notify/index.ts
//
// Fired by a Supabase Database Webhook on the `picks` table (events: INSERT, UPDATE).
// - INSERT (a new pick, always status 'open'): emails everyone in `profiles`
//   with notify_on_pick_open = true (Luke, by default).
// - UPDATE where status changed and the new status isn't 'open': emails the
//   pick's owner_id.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STATUS_LABEL: Record<string, string> = {
  open: 'Not started',
  part_picked: 'In progress',
  short_picked: 'Picked as far as possible',
  ready: 'Ready to dispatch',
  dispatched: 'Dispatched',
  cancelled: 'Cancelled',
}

function ukDate(d: string | null) {
  if (!d) return 'no date set'
  const [y, m, day] = d.split('-')
  return `${day}-${m}-${y}`
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (to.length === 0) return
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('FROM_EMAIL'),
      to,
      subject,
      html,
    }),
  })
  if (!res.ok) {
    console.error('Resend error', res.status, await res.text())
  }
}

Deno.serve(async (req) => {
  // Basic protection: the Database Webhook is configured to send this header.
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = await req.json()
  const { type, record, old_record } = payload as {
    type: 'INSERT' | 'UPDATE' | 'DELETE'
    record: any
    old_record: any
  }

  if (type !== 'INSERT' && type !== 'UPDATE') {
    return new Response('ignored', { status: 200 })
  }
  if (type === 'UPDATE' && old_record?.status === record.status) {
    // Not a status change (e.g. holder_id, note, picked_qty edits) — nothing to send.
    return new Response('no status change', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: project } = record.project_id
    ? await supabase.from('projects').select('code, name').eq('id', record.project_id).single()
    : { data: null }
  const jobLabel = project ? `${project.code} — ${project.name}` : 'Unassigned project'
  const collectionLabel = ukDate(record.collection_date)

  if (type === 'INSERT') {
    const { data: notifyList } = await supabase
      .from('profiles')
      .select('email')
      .eq('notify_on_pick_open', true)
      .not('email', 'is', null)

    const to = (notifyList || []).map((p) => p.email)
    await sendEmail(
      to,
      `New pick list: ${jobLabel}`,
      `<p>A new pick list has been created.</p>
       <p><strong>Job:</strong> ${jobLabel}<br/>
       <strong>Collection date:</strong> ${collectionLabel}</p>`
    )
    return new Response('ok', { status: 200 })
  }

  // UPDATE with a real status change, past 'open'.
  if (!record.owner_id) {
    // No owner set (shouldn't happen once the UI requires it, but don't error the webhook).
    return new Response('no owner set', { status: 200 })
  }

  const { data: owner } = await supabase
    .from('profiles')
    .select('email, name')
    .eq('id', record.owner_id)
    .single()

  if (!owner?.email) {
    return new Response('owner has no email', { status: 200 })
  }

  const statusLabel = STATUS_LABEL[record.status] || record.status
  await sendEmail(
    [owner.email],
    `Pick update: ${jobLabel} — ${statusLabel}`,
    `<p>Status changed on your pick list.</p>
     <p><strong>Job:</strong> ${jobLabel}<br/>
     <strong>Collection date:</strong> ${collectionLabel}<br/>
     <strong>Status:</strong> ${statusLabel}</p>
     ${record.note ? `<p><strong>Note:</strong> ${record.note}</p>` : ''}`
  )

  return new Response('ok', { status: 200 })
})