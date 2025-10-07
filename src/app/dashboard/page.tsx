import { createServerClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'sonner'

export default async function Dashboard() {
  const cookieStore = await cookies()
  const supabase = await createServerClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  let initialRequests = []
  if (isAdmin) {
    const { data } = await supabase
      .from('requests')
      .select('*, bids(*, profiles!inner(submitted_by))')
      .order('created_at', { ascending: false })
    initialRequests = data || []
  } else {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('is_active', true)
      .eq('tier', 'Standard')
    initialRequests = data || []
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-8">ProcureBid Kontrol Paneli</h1>
      {isAdmin && <CreateRequestForm />}
      <div className="grid gap-4 mt-8">
        <RequestsList initialRequests={initialRequests} isAdmin={isAdmin} />
      </div>
    </main>
  )
}

'use client'
function RequestsList({ initialRequests, isAdmin }) {
  const [requests, setRequests] = useState(initialRequests)
  const supabase = createClient()

  useEffect(() => {
    setRequests(initialRequests)
  }, [initialRequests])

  useEffect(() => {
    if (!isAdmin) return

    const bidChannel = supabase
      .channel('bids-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bids' },
        (payload) => {
          setRequests((prev) =>
            prev.map((req) => ({
              ...req,
              bids: req.bids?.map((bid) =>
                bid.id === payload.new.id ? { ...bid, status: payload.new.status } : bid
              ) || [],
            }))
          )
          toast.success(`Teklif ${payload.new.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}`)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(bidChannel)
  }, [isAdmin])

  const handleToggleActive = async (requestId, currentActive) => {
    setRequests((prev) =>
      prev.map((req) =>
        req.id === requestId ? { ...req, is_active: !currentActive } : req
      )
    )

    const { error } = await supabase
      .from('requests')
      .update({ is_active: !currentActive })
      .eq('id', requestId)

    if (error) {
      setRequests((prev) =>
        prev.map((req) =>
          req.id === requestId ? { ...req, is_active: currentActive } : req
        )
      )
      toast.error('Anahtar çevirme başarısız: ' + error.message)
    } else {
      toast.success(!currentActive ? 'Talep listelendi!' : 'Talep listeden çıkarıldı.')
    }
  }

  const handleStatusUpdate = async (bidId, newStatus) => {
    const { error } = await supabase
      .from('bids')
      .update({ status: newStatus })
      .eq('id', bidId)
    if (error) toast.error('Güncelleme başarısız: ' + error.message)
    else toast.success(`${newStatus === 'approved' ? 'Onaylandı' : 'Reddedildi'}! Tedarikçiye e-posta gönderildi.`)
  }

  if (!isAdmin) {
    return (
      <>
        {requests.map((req) => (
          <Card key={req.id}>
            <CardContent className="p-6">
              <CardTitle>{req.title}</CardTitle>
              <span className="text-sm text-muted-foreground block">
                Kategori: {req.category} | Bütçe: ${req.budget} | Teklif Ücreti: ${req.bid_fee} | Seviye: {req.tier}
              </span>
              <p className="text-sm text-muted-foreground mt-2">{req.description}</p>
              <Button asChild className="mt-4">
                <Link href={`/bid/${req.id}`}>Teklif Ver</Link>
              </Button>
            </CardContent>
          </Card>
        )) || <p>Etkin talepler mevcut değil.</p>}
      </>
    )
  }

  return (
    <>
      {requests.map((req) => (
        <Card key={req.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center space-x-2">
                {req.title}
                <Badge variant={req.is_active ? "default" : "secondary"}>
                  {req.is_active ? 'Listelenmiş' : 'Listeden Çıkarılmış'}
                </Badge>
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                Kategori: {req.category} | Bütçe: ${req.budget} | Teklif Ücreti: ${req.bid_fee} | Seviye: {req.tier}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Label htmlFor={`active-${req.id}`} className="text-sm">
                {req.is_active ? 'Listelenmiş' : 'Listeden Çıkarılmış'}
              </Label>
              <Switch
                id={`active-${req.id}`}
                checked={req.is_active}
                onCheckedChange={() => handleToggleActive(req.id, req.is_active)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <p className="text-sm text-muted-foreground mb-2">{req.description}</p>
            <p className="text-xs text-muted-foreground mb-4">
              Teklif Son Tarihi: {new Date(req.bid_deadline).toLocaleDateString()} | Teslim Tarihi: {new Date(req.delivery_date).toLocaleDateString()}
            </p>
            <div className="mt-4">
              <p className="font-semibold">Alınan Teklifler: {req.bids?.length || 0}</p>
              {req.bids && req.bids.length > 0 ? (
                <Accordion type="single" collapsible className="mt-2">
                  <AccordionItem value="bids">
                    <AccordionTrigger>Teklif Detayları</AccordionTrigger>
                    <AccordionContent>
                      {req.bids.map((bid) => (
                        <div key={bid.id} className="border-b py-4 last:border-b-0 flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-medium">Teklif: ${bid.amount} | Teslim: {bid.delivery_days} gün</p>
                              <Badge variant={bid.status === 'approved' ? 'default' : bid.status === 'rejected' ? 'destructive' : 'secondary'}>
                                {bid.status === 'approved' ? 'Onaylandı' : bid.status === 'rejected' ? 'Reddedildi' : 'Beklemede'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-1">Tarafından: {bid.profiles?.company_name || 'Yok'}</p>
                            <p className="text-sm mb-1">Detaylar: {bid.details}</p>
                            <p className="text-xs text-muted-foreground mb-1">Ödeme: {bid.payment_method?.replace('_', ' ')}</p>
                            {bid.payment_method === 'bank_transfer' && bid.receipt_url && (
                              <a href={bid.receipt_url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                                Dekontu Görüntüle
                              </a>
                            )}
                          </div>
                          {bid.status === 'pending' && (
                            <div className="flex space-x-2 ml-4">
                              <Button size="sm" variant="default" onClick={() => handleStatusUpdate(bid.id, 'approved')}>
                                Onayla
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleStatusUpdate(bid.id, 'rejected')}>
                                Reddet
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">Henüz teklif yok.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )) || <p>Talep mevcut değil.</p>}
    </>
  )
}

function CreateRequestForm() {
  const [formData, setFormData] = useState({
    title: '', category: '', budget: '', bid_fee: '', description: '', bidDeadline: '', deliveryDate: '', tier: 'Standard'
  })
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    const { data, error } = await supabase
      .from('requests')
      .insert({ 
        ...formData, 
        created_by: user?.id,
        budget: parseFloat(formData.budget),
        bid_fee: parseFloat(formData.bid_fee),
        bid_deadline: formData.bidDeadline,
        delivery_date: formData.deliveryDate
      })
      .select()
    if (error?.code === '23505') toast.error('Yinelenen başlık!')
    else if (error) toast.error('Talep oluşturma hatası: ' + error.message)
    else {
      toast.success('Talep oluşturuldu!')
      window.location.reload()
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Yeni Talep Oluştur</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Talep Başlığı</Label>
            <Input id="title" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} required />
          </div>
          <div>
            <Label htmlFor="category">Kategori</Label>
            <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})} required>
              <SelectTrigger>
                <SelectValue placeholder="Kategori Seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Equipment">Ekipman</SelectItem>
                <SelectItem value="Supplies">Sarf Malzemeleri</SelectItem>
                <SelectItem value="Services">Hizmetler</SelectItem>
                <SelectItem value="Technology">Teknoloji</SelectItem>
                <SelectItem value="Furniture">Mobilya</SelectItem>
                <SelectItem value="Construction">İnşaat</SelectItem>
                <SelectItem value="Other">Diğer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="budget">Bütçe ($)</Label>
            <Input id="budget" type="number" step="0.01" value={formData.budget} onChange={(e) => setFormData({...formData, budget: e.target.value})} required />
          </div>
          <div>
            <Label htmlFor="bid_fee">Teklif Ücreti ($)</Label>
            <Input id="bid_fee" type="number" step="0.01" value={formData.bid_fee} onChange={(e) => setFormData({...formData, bid_fee: e.target.value})} required />
          </div>
          <div>
            <Label htmlFor="description">Açıklama</Label>
            <Textarea id="description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
          </div>
          <div>
            <Label htmlFor="bidDeadline">Teklif Son Tarihi</Label>
            <Input id="bidDeadline" type="date" value={formData.bidDeadline} onChange={(e) => setFormData({...formData, bidDeadline: e.target.value})} required />
          </div>
          <div>
            <Label htmlFor="deliveryDate">Teslim Tarihi</Label>
            <Input id="deliveryDate" type="date" value={formData.deliveryDate} onChange={(e) => setFormData({...formData, deliveryDate: e.target.value})} required />
          </div>
          <div>
            <Label>Seviye</Label>
            <RadioGroup value={formData.tier} onValueChange={(v) => setFormData({...formData, tier: v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Standard" id="standard" />
                <Label htmlFor="standard">Standart - Tüm Tedarikçiler</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Elite" id="elite" />
                <Label htmlFor="elite">Elit - Yalnızca Elit Tedarikçiler</Label>
              </div>
            </RadioGroup>
          </div>
          <Button type="submit">Talebi Oluştur</Button>
        </form>
      </CardContent>
    </Card>
  )
}
