import {createBrowserRouter,RouterProvider,Link,useRouteError} from 'react-router-dom';
import {AppProvider} from './lib/context';
import AppLayout from './layouts/AppLayout';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import RFQ from './pages/RFQ';
import Calculator from './pages/Calculator';
import Auth,{RequireAuth} from './pages/Auth';
import Account from './pages/Account';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Admin,{ProductEditor,BuyerDetail} from './pages/Admin';
import {OrderDetail,RfqDetail} from './pages/Records';
import {Capabilities,Quality,CaseStudies,Contact,Legal} from './pages/Company';
const protect=(element,admin=false)=><RequireAuth admin={admin}>{element}</RequireAuth>;
function NotFound(){return <section className="section"><div className="container"><span className="eyebrow">404</span><h1>This page isn’t in the catalog.</h1><p>Use the product catalog or return to the homepage.</p><Link className="btn" to="/products">Browse chemicals</Link></div></section>;}
function RouteError(){const error=useRouteError();return <div className="container section"><h1>We couldn’t open this page.</h1><p>Please reload the page or return to the catalog.</p><a className="btn" href="/products">Open catalog</a></div>;}
const router=createBrowserRouter([{path:'/',element:<AppLayout/>,errorElement:<RouteError/>,children:[{index:true,element:<Home/>},{path:'products',element:<Products/>},{path:'products/:slug',element:<ProductDetail/>},{path:'rfq',element:<RFQ/>},{path:'volume-calculator',element:<Calculator/>},{path:'capabilities',element:<Capabilities/>},{path:'quality',element:<Quality/>},{path:'case-studies',element:<CaseStudies/>},{path:'contact',element:<Contact/>},{path:'privacy',element:<Legal type="privacy"/>},{path:'terms',element:<Legal type="terms"/>},{path:'login',element:<Auth key="login"/>},{path:'register',element:<Auth key="register" mode="register"/>},{path:'forgot-password',element:<Auth key="forgot" mode="forgot"/>},{path:'reset-password',element:<Auth key="reset" mode="reset"/>},{path:'cart',element:protect(<Cart/>)},{path:'checkout',element:protect(<Checkout/>)},{path:'account',element:protect(<Account/>)},{path:'orders/:id',element:protect(<OrderDetail/>)},{path:'rfqs/:id',element:protect(<RfqDetail/>)},{path:'admin',element:protect(<Admin/>,true)},{path:'admin/products/:id',element:protect(<ProductEditor/>,true)},{path:'admin/buyers/:id',element:protect(<BuyerDetail/>,true)},{path:'*',element:<NotFound/>}]}]);
export default function App(){return <AppProvider><RouterProvider router={router}/></AppProvider>;}
