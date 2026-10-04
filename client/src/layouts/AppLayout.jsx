import {Outlet,useLocation} from 'react-router-dom';
import {useEffect} from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
export default function AppLayout(){const location=useLocation();useEffect(()=>{window.scrollTo(0,0);const page=location.pathname.split('/')[1];document.title=(page?page.replaceAll('-',' ').replace(/^./,c=>c.toUpperCase())+' | ':'')+'Valence Chemical Group';},[location.pathname]);return <><a className="skip-link" href="#main-content">Skip to content</a><Header/><main id="main-content"><Outlet/></main><Footer/></>;}
