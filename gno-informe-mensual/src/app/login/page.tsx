export default function Login() {
  return (
    <div style={{minHeight:'100vh',background:'#0B1F3A',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'rgba(255,255,255,0.1)',borderRadius:'16px',padding:'40px',width:'100%',maxWidth:'400px',textAlign:'center'}}>
        <h1 style={{color:'white',fontSize:'24px',fontFamily:'Georgia,serif',marginBottom:'8px'}}>
          GNO Tax Business Center
        </h1>
        <p style={{color:'#7FA3C4',fontSize:'14px',marginBottom:'32px'}}>
          Portal de Informes Financieros
        </p>
        
          href="/api/auth/signin/google?callbackUrl=%2Fadmin"
          style={{display:'block',background:'white',color:'#0B1F3A',fontWeight:'600',padding:'12px 24px',borderRadius:'8px',textDecoration:'none'}}
        >
          Iniciar sesion con Google
        </a>
      </div>
    </div>
  )
}
