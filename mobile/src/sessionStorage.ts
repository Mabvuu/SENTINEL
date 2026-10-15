import {Platform} from 'react-native';
import * as NativeStore from 'expo-secure-store';
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY=NativeStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;
// Browser preview sessions last only until the page is reloaded.
const memory=new Map<string,string>();
export const getItemAsync:typeof NativeStore.getItemAsync=async(key,options)=>Platform.OS==='web'?(memory.get(key)??null):NativeStore.getItemAsync(key,options);
export const setItemAsync:typeof NativeStore.setItemAsync=async(key,value,options)=>{if(Platform.OS==='web'){memory.set(key,value);return;}await NativeStore.setItemAsync(key,value,options);};
export const deleteItemAsync:typeof NativeStore.deleteItemAsync=async(key,options)=>{if(Platform.OS==='web'){memory.delete(key);return;}await NativeStore.deleteItemAsync(key,options);};
