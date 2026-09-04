import { redirect } from 'next/navigation'

export default function LoginPage() {
  redirect('/api/auth/signin/google?callbackUrl=%2Fadmin')
}
