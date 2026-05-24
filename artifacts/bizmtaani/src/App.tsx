import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import PostProduct from "@/pages/PostProduct";
import ProductDetail from "@/pages/ProductDetail";
import MyListings from "@/pages/MyListings";
import ChatList from "@/pages/ChatList";
import ChatThread from "@/pages/ChatThread";
import Profile from "@/pages/Profile";
import Msquare from "@/pages/Msquare";
import CreateCommunityPost from "@/pages/CreateCommunityPost";
import CommunityPostDetail from "@/pages/CommunityPostDetail";
import ShopCatalogue from "@/pages/ShopCatalogue";

const queryClient = new QueryClient();

function NotificationSetup() {
  const { user } = useAuth();
  useNotifications();
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/post" component={PostProduct} />
      <Route path="/product/:id" component={ProductDetail} />
      <Route path="/my-listings" component={MyListings} />
      <Route path="/chats" component={ChatList} />
      <Route path="/chat/:chatId" component={ChatThread} />
      <Route path="/profile" component={Profile} />
      <Route path="/msquare" component={Msquare} />
      <Route path="/msquare/create" component={CreateCommunityPost} />
      <Route path="/msquare/:postId" component={CommunityPostDetail} />
      <Route path="/shop/:userId" component={ShopCatalogue} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <NotificationSetup />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
