'use client'
import { useParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function SubmitBid() {
  const params = useParams()
  const requestId = params.id as string
  const [request, setRequest] = useState(null)
  const [formData, setFormData] = useState({ amount: '', deliveryDays: '', details: '' })
  const [paymentMethod, setPaymentMethod] = useState('credit_card')
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [receiptFile, setReceiptFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [bidCount, setBidCount] = useState(0)
  const fileInputRef = useRef(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('requests').select('*').eq('id', requestId).single().then(({ data }) => setRequest(data))

    const sub = supabase
      .channel('bids')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `request_id=eq.${requestId}` }, () => {
        supabase.from('bids').select('id', { count: 'exact' }).eq('request_id', requestId).then(({ count }) => setBidCount(count || 0))
      })
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [requestId])

  const handleFileChange = (e) => {
    if (e.target.files[0]) setReceiptFile(e.target.files[0])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConfirmed) {
      toast.error('Lütfen ödeme yöntemini onaylayın.')
      return
    }
    if (paymentMethod === 'bank_transfer' && !receiptFile) {
      toast.error('Lütfen banka dekontu yükleyin.')
      return
    }

    setUploading(true)
    let receiptUrl = null
    if (paymentMethod === 'bank_transfer') {
      const fileExt = receiptFile.name.split('.').pop()
      const fileName = `${Date.now()}-${(await supabase.auth.getUser()).data.user?.id}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(`bids/${fileName}`, receiptFile, { upsert: true, contentType: receiptFile.type })
      
      if (uploadError) {
        toast.error('Yükleme başarısız: ' + uploadError.message)
        setUploading(false)
        return
      }
      
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(`bids/${fileName}`)
      receiptUrl = publicUrl
    }

    const { data: user } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('bids')
      .insert({ 
        ...formData, 
        request_id: requestId, 
        submitted_by: user.user?.id,
        payment_method: paymentMethod,
        receipt_url: receiptUrl
      })
    
    setUploading(false)
    if (error) toast.error('Teklif gönderme başarısız: ' + error.message)
    else {
      toast.success('Teklif başarıyla gönderildi!')
      router.push('/dashboard')
    }
  }

  if (!request) return <div className="p-8">Yükleniyor...</div>

  return (
    <main className="p-8">
      <Card>
        <CardHeader>
          <CardTitle>{request.title} İçin Teklif Ver</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bütçe: ${request.budget} | Teklif Ücreti: ${request.bid_fee} | Alınan Teklifler: {bidCount}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <Input
                placeholder="Teklif Tutarı ($)"
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                required
              />
              <Input
                placeholder="Teslim Süresi (gün)"
                type="number"
                value={formData.deliveryDays}
                onChange={(e) => setFormData({...formData, deliveryDays: e.target.value})}
                required
              />
              <Textarea
                placeholder="Teklif Detayları..."
                value={formData.details}
                onChange={(e) => setFormData({...formData, details: e.target.value})}
                required
              />
            </div>

            <div className="space-y-4">
              <Label className="text-lg font-semibold">Teklif Ücreti Ödeme Yöntemi (${request.bid_fee})</Label>
              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="credit_card" id="credit_card" />
                  <Label htmlFor="credit_card">Kredi Kartı (güvenli işlenir)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bank_transfer" id="bank_transfer" />
                  <Label htmlFor="bank_transfer">Banka Transferi</Label>
                </div>
              </RadioGroup>

              {paymentMethod === 'bank_transfer' && (
                <div className="space-y-2 p-4 border rounded-md">
                  <Label>Banka Dekontu Yükle</Label>
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    required
                  />
                  <p className="text-sm text-muted-foreground">Desteklenen: Resimler, PDF'ler</p>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="confirm" 
                  checked={isConfirmed} 
                  onCheckedChange={setIsConfirmed} 
                  required 
                />
                <Label htmlFor="confirm">
                  {paymentMethod === 'credit_card' 
                    ? 'Teklif ücretini kredi kartı ile ödemeyi kabul ediyorum.' 
                    : 'Teklif ücretini banka transferi ile ödediğimi ve dekontu yüklediğimi onaylıyorum.'}
                </Label>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                Göndererek platform şartlarını kabul edersiniz. Teklifinizi doğrulamak için ödeme gereklidir.
              </AlertDescription>
            </Alert>

            <div className="flex space-x-2">
              <Button type="submit" disabled={uploading}>
                {uploading ? 'Gönderiliyor...' : 'Teklif Ver'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/dashboard')}>
                İptal
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
