"use client";
import { useEffect, useRef, useState } from "react";
import SuccessMotion from "./ui/SuccessMotion";

export default function SuccessFeedback() {
  const [message,setMessage]=useState<{id:number;title:string}|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    function receive(event:Event){
      const title=(event as CustomEvent<unknown>).detail;
      if(typeof title!=="string" || !title.trim() || title.length>200)return;
      if(timer.current)clearTimeout(timer.current);
      setMessage({id:Date.now(),title});
      timer.current=setTimeout(()=>setMessage(null),4000);
    }
    window.addEventListener("salapi:success-motion",receive);
    return()=>{window.removeEventListener("salapi:success-motion",receive);if(timer.current)clearTimeout(timer.current);};
  },[]);
  return message ? <div className="sl-success-feedback"><SuccessMotion key={message.id} title={message.title}/><button type="button" aria-label="Dismiss success notice" onClick={()=>setMessage(null)}>×</button></div> : null;
}
