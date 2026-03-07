import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Cctv, LogIn, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_retail-footfall/artifacts/bjfv2q4b_image.png';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(username, password);
      toast.success(`Hoş geldiniz, ${user.full_name}`);
      navigate('/');
    } catch (e) {
      console.error('Login failed', e);
      setError(e.response?.data?.detail || 'Giriş başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img 
            src={LOGO_URL} 
            alt="VMS360 Logo" 
            className="w-20 h-20 mx-auto object-contain mb-4 rounded-xl"
          />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            VMS360
          </h1>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mt-1">
            Retail Panel
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-card border border-border p-6">
          <h2 className="text-lg font-semibold mb-6 text-center">Giriş Yap</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">Kullanıcı Adı</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Kullanıcı adınız"
                required
                className="bg-secondary/50 border-border"
                data-testid="login-username"
              />
            </div>
            <div>
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-secondary/50 border-border"
                data-testid="login-password"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
              data-testid="login-submit"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Giriş yapılıyor...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Giriş Yap
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          VMS360 Retail Panel v1.0.0
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
