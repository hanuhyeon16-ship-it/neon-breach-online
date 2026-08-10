// Compatibility layer for Supabase Auth response variants.
const originalSignup=signup;
signup=async function(){
 const email=$('#signupEmail').value.trim(),password=$('#signupPassword').value,username=$('#signupUsername').value.trim().toLowerCase(),display_name=$('#signupDisplay').value.trim()||username;
 if(!email||password.length<6||username.length<3)return toast('이메일, 6자 이상 비밀번호, 3자 이상 닉네임을 입력하세요.');
 try{
  const r=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,data:{username,display_name}})});
  const d=await r.json();
  if(!r.ok)throw new Error(d.msg||d.message||d.error_description||'가입 실패');
  if(d.access_token){session=d;localStorage.setItem('nb_supabase_session',JSON.stringify(session));await bootAccount();modal(false);toast('계정이 생성됐습니다.');}
  else toast('가입 완료. 이메일 인증 메일이 왔다면 인증 후 로그인하세요.');
 }catch(e){toast(e.message)}
};
const signupButton=document.querySelector('#signupBtn');if(signupButton)signupButton.onclick=signup;
