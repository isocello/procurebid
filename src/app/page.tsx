'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  const handleAuth = async () => {
    const { data, error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (error) alert(error.message)
    else {
      if (!isLogin) {
        const { data: user } = await supabase.auth.getUser()
        await supabase.from('profiles').upsert({
          id: user.user?.id,
          email: email,
          role: 'vendor',
          company_name: '',
        })
      }
      router.push('/dashboard')
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>{isLogin ? 'Giriş Yap' : 'Tedarikçi Olarak Kayıt Ol'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button onClick={handleAuth} className="w-full">
            {isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
          </Button>
          <Button variant="link" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Kayıt Ol' : 'Giriş Yap'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Demo Yönetici: admin@company.com / admin123
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
