import { createContext, useContext } from 'react';
export type Interactions={auth:(mode?:'login'|'register',onSuccess?:()=>void)=>void;compose:()=>void};
export const InteractionContext=createContext<Interactions>({auth:()=>{},compose:()=>{}});
export const useInteractions=()=>useContext(InteractionContext);
