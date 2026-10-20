import {useEffect,useState} from 'react';
export function useDevice(){const [mobile,setMobile]=useState(()=>matchMedia('(max-width:700px)').matches);useEffect(()=>{const query=matchMedia('(max-width:700px)');const changed=()=>setMobile(query.matches);query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[]);return mobile?'mobile':'desktop';}
