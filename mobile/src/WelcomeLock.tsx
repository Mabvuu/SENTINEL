import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Modal,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
export default function WelcomeLock({name,onDone}:{name:string;onDone:()=>void}){
 const lift=useRef(new Animated.Value(0)).current;
 const done=useRef(onDone);done.current=onDone;
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{let alive=true;let timer:ReturnType<typeof setTimeout>|undefined;
  AccessibilityInfo.isReduceMotionEnabled().catch(()=>false).then(reduce=>{if(!alive)return;setReduced(reduce);if(reduce)lift.setValue(1);else Animated.timing(lift,{toValue:1,duration:650,useNativeDriver:Platform.OS!=='web'}).start();timer=setTimeout(()=>done.current(),reduce?600:1500);});
  return()=>{alive=false;lift.stopAnimation();if(timer)clearTimeout(timer);};
 },[lift]);
 return <Modal visible transparent animationType={reduced?'none':'fade'} onRequestClose={onDone}><View style={s.backdrop}><View style={s.card} accessibilityViewIsModal>
 <View style={s.emblem}><Animated.View style={[s.shackle,{transform:[{translateY:lift.interpolate({inputRange:[0,1],outputRange:[0,-15]})},{rotate:lift.interpolate({inputRange:[0,1],outputRange:['0deg','-20deg']})}]}]}/><View style={s.body}><View style={s.key}/></View></View>
 <Text style={s.kicker}>ACCESS GRANTED</Text><Text style={s.title}>Welcome, {name}</Text><Text style={s.note}>Your shift is ready to view.</Text><Pressable accessibilityRole="button" onPress={onDone} style={s.button}><Text style={s.buttonText}>Continue</Text></Pressable>
 </View></View></Modal>;
}
const s=StyleSheet.create({backdrop:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'rgba(15,30,47,.72)',padding:24},card:{width:'100%',maxWidth:390,padding:30,backgroundColor:'#fff',borderRadius:26,alignItems:'center'},emblem:{width:108,height:120,alignItems:'center',justifyContent:'center',marginBottom:18},shackle:{position:'absolute',top:17,width:48,height:52,borderWidth:7,borderColor:'#dc8b38',borderTopLeftRadius:26,borderTopRightRadius:26},body:{position:'absolute',bottom:12,width:76,height:59,borderRadius:15,backgroundColor:'#203b58',alignItems:'center',justifyContent:'center'},key:{width:8,height:19,borderRadius:5,backgroundColor:'#f5b56e'},kicker:{color:'#a46220',fontSize:11,letterSpacing:2,fontWeight:'600'},title:{fontSize:23,fontWeight:'600',color:'#203b58',marginTop:12,textAlign:'center'},note:{color:'#65758a',fontSize:14,marginTop:10,textAlign:'center'},button:{marginTop:24,padding:14,alignSelf:'stretch',backgroundColor:'#f5b56e',borderRadius:12},buttonText:{color:'#203b58',fontWeight:'600',textAlign:'center'}});
