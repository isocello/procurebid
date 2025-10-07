import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  try {
    const { new_record } = await req.json()
    const bid_id = new_record.id
    const status = new_record.status
    if (!bid_id || !status) {
      return new Response('Missing data', { status: 400 })
    }

    const { data: bid, error } = await supabase
      .from('bids')
      .select(`
        id,
        status,
        amount,
        requests (
          title
        ),
        profiles!submitted_by_fkey (
          email,
          company_name
        )
      `)
      .eq('id', bid_id)
      .single()

    if (error || !bid) {
      return new Response('Bid not found', { status: 404 })
    }

    const { requests, profiles } = bid
    const subject = status === 'approved' ? 'Teklif Onaylandı! 🎉' : 'Teklif Güncellemesi: İnceleme Gerekli'
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${status === 'approved' ? 'Onaylandı!' : 'Reddedildi'}</h2>
        <p>Merhaba ${profiles.company_name || 'Tedarikçi'},</p>
        <p><strong>${requests.title}</strong> için teklifiniz ($${bid.amount}) <strong>${status === 'approved' ? 'onaylandı' : 'reddedildi'}</strong>.</p>
        ${status === 'approved' ? 
          '<p>Sonraki adımlar: Alıcı ile iletişime geçin. Detayları görüntüleyin: <a href="https://your-app.vercel.app/dashboard">Kontrol Paneli</a></p>' : 
          '<p>Teklifinizi inceleyin ve gerekirse yeniden gönderin. Sorularınız için bu e-postaya yanıt verin.</p>'
        }
        <p>Saygılarımızla,<br>ProcureBid Ekibi</p>
        <hr>
        <p style="font-size: 12px; color: #666;">Bu otomatik bir mesajdır. Yanıt vermeyin.</p>
      </div>
    `

    const { data: emailData, error: sendError } = await resend.emails.send({
      from: 'ProcureBid Notifications <noreply@yourdomain.com>',
      to: profiles.email,
      subject,
      html,
    })

    if (sendError) {
      console.error('Email send failed:', sendError)
      return new Response('Email failed', { status: 500 })
    }

    return new Response('Email sent', { status: 200 })
  } catch (err) {
    console.error('Function error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
