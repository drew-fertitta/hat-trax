'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import imageCompression from 'browser-image-compression';

// --- DEFAULT STATE ---
const EMPTY_CATEGORIES = {
  types: [], colors: [], leagues: [], teams: [], occasions: [], locations: []
};

const EMPTY_HAT_FORM = {
  name: '', yearPurchased: '', type: '', color: '', league: '', team: '', occasion: '', location: '', rating: 0, isFavorite: false
};

const ITEMS_PER_PAGE = 12;

export default function Home() {
  // Auth States
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);

  // App Core States
  const [hats, setHats] = useState<any[]>([]);
  const [categories, setCategories] = useState<any>(EMPTY_CATEGORIES);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false); 
  
  // Theme & View States
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'favorites' | 'untagged'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({
    type: '', color: '', league: '', team: '', occasion: '', location: ''
  });
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newHatForm, setNewHatForm] = useState(EMPTY_HAT_FORM);
  
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const [editingHat, setEditingHat] = useState<any>(null); 
  const [hatToDelete, setHatToDelete] = useState<string | null>(null); 

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string>('types');
  const [newCategoryValue, setNewCategoryValue] = useState('');
  
  const [randomHat, setRandomHat] = useState<any>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  // --- THEME INITIALIZATION LOGIC ---
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  // --- 1. TRACK AUTHENTICATION SESSION SYSTEM ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchDatabase();
      else setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchDatabase();
      else {
        setHats([]);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchDatabase = async () => {
    setIsLoading(true);
    try {
      const { data: catData, error: catError } = await supabase.from('categories').select('*');
      if (catError) throw catError;
      
      if (catData && catData.length > 0) {
        const dbCategories: any = { ...EMPTY_CATEGORIES };
        catData.forEach(c => { dbCategories[c.category_key] = c.options || []; });
        setCategories(dbCategories);
      } else {
        setCategories(EMPTY_CATEGORIES);
      }

      const { data: hatData, error: hatError } = await supabase.from('hats').select('*').order('created_at', { ascending: false });
      if (hatError) throw hatError;

      if (hatData) {
        const formattedHats = hatData.map(h => ({
          id: h.id,
          name: h.name || 'Untagged Hat',
          image: h.image || 'https://images.unsplash.com/photo-1521369909029-2afed882259b?w=500',
          type: h.type || '',
          color: h.color || '',
          league: h.league || '',
          team: h.team || '',
          occasion: h.occasion || '',
          location: h.location || '',
          rating: h.rating || 0,
          isFavorite: h.is_favorite ?? false, 
          yearPurchased: h.year_purchased || '' 
        }));
        setHats(formattedHats);
      }
    } catch (error) {
      console.error("Error loading data from Supabase:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- AUTH RUNTIME HANDLERS ---
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email inbox for your registration confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      alert(err.message || 'Authentication operation failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- DYNAMIC DROPDOWN SWEEP HELPER ---
  // Captures database categories PLUS any ghost categories currently on hats
  const getDropdownOptions = (pluralKey: string, singularKey: string) => {
    const savedOptions = categories[pluralKey] || [];
    const hatOptions = hats.map(h => h[singularKey]).filter(val => val && val.trim() !== '');
    const uniqueSet = new Set([...savedOptions, ...hatOptions]);
    return Array.from(uniqueSet).sort((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()));
  };

  // --- FILTER & PAGINATION LOGIC ---
  const filteredHats = hats.filter(hat => {
    if (viewMode === 'favorites' && !hat.isFavorite) return false;
    
    if (viewMode === 'untagged') {
      const isCompletelyUntagged = !hat.type && !hat.color && !hat.league && !hat.team && !hat.occasion && !hat.location;
      if (!isCompletelyUntagged) return false;
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = hat.name.toLowerCase().includes(q);
      const matchTeam = (hat.team || '').toLowerCase().includes(q);
      const matchLeague = (hat.league || '').toLowerCase().includes(q);
      if (!matchName && !matchTeam && !matchLeague) return false;
    }

    return Object.keys(selectedFilters).every(key => {
      if (!selectedFilters[key]) return true;
      return (hat as any)[key] === selectedFilters[key];
    });
  });

  // Reset page and slider to 1 when filters change
  useEffect(() => {
    setCurrentSlide(0);
    setCurrentPage(1);
  }, [selectedFilters, viewMode, searchQuery]);

  // Derived arrays for UI
  const sliderHats = filteredHats.slice(0, 10); 
  const totalPages = Math.max(1, Math.ceil(filteredHats.length / ITEMS_PER_PAGE));
  const paginatedHats = filteredHats.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pickRandomHat = () => {
    if (filteredHats.length === 0) return;
    setRandomHat(filteredHats[Math.floor(Math.random() * filteredHats.length)]);
  };

  // CATEGORY SYNC LOGIC
  const syncCategoryToDB = async (catKey: string, newOptions: string[]) => {
    const { data } = await supabase.from('categories').select('id').eq('category_key', catKey);
    if (data && data.length > 0) {
      await supabase.from('categories').update({ options: newOptions } as any).eq('category_key', catKey);
    } else {
      await supabase.from('categories').insert([{ category_key: catKey, options: newOptions }] as any);
    }
  };

  const learnNewCategories = async (formState: any) => {
    const updatedCategories = { ...categories };
    let categoriesChanged = false;
    const mappings: Record<string, string> = {
      type: 'types', color: 'colors', league: 'leagues', team: 'teams', occasion: 'occasions', location: 'locations'
    };

    for (const [formKey, catKey] of Object.entries(mappings)) {
      const typedValue = (formState[formKey] || '').toString().trim();
      
      if (!updatedCategories[catKey]) updatedCategories[catKey] = [];
      const exists = updatedCategories[catKey].some((item: string) => item.toLowerCase() === typedValue.toLowerCase());

      if (typedValue && !exists) {
        updatedCategories[catKey] = [...updatedCategories[catKey], typedValue];
        categoriesChanged = true;
        syncCategoryToDB(catKey, updatedCategories[catKey]);
      }
    }
    
    if (categoriesChanged) setCategories(updatedCategories);
  };

  const handleAddCategoryItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryValue.trim()) return;
    
    const currentOptions = categories[editingCategory] || [];
    const newOptions = [...currentOptions, newCategoryValue.trim()];
    
    setCategories({ ...categories, [editingCategory]: newOptions });
    syncCategoryToDB(editingCategory, newOptions);
    setNewCategoryValue('');
  };

  const handleRemoveCategoryItem = (itemToRemove: string) => {
    const newOptions = (categories[editingCategory] || []).filter((item: string) => item !== itemToRemove);
    setCategories({ ...categories, [editingCategory]: newOptions });
    syncCategoryToDB(editingCategory, newOptions);
  };

  // FILE UPLOAD SYSTEM
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles(prev => [...prev, ...files]);
      setPreviewUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    }
  };

  const uploadSingleFileToStorage = async (file: File): Promise<string> => {
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `hats/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('hat-photos')
        .upload(filePath, compressedFile);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('hat-photos').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (err) {
      console.error('Upload system error:', err);
      return 'https://images.unsplash.com/photo-1521369909029-2afed882259b?w=500';
    }
  };

  const toggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    const hat = hats.find(h => h.id === id);
    if (!hat) return;
    setHats(hats.map(h => h.id === id ? { ...h, isFavorite: !h.isFavorite } : h));
    if (randomHat && randomHat.id === id) setRandomHat({ ...randomHat, isFavorite: !randomHat.isFavorite });
    await supabase.from('hats').update({ is_favorite: !hat.isFavorite } as any).eq('id', id);
  };

  const handleAddHat = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    let permanentImageUrl = 'https://images.unsplash.com/photo-1521369909029-2afed882259b?w=500';
    if (pendingFiles.length > 0) permanentImageUrl = await uploadSingleFileToStorage(pendingFiles[0]);

    await learnNewCategories(newHatForm);

    const dbHat = {
      name: newHatForm.name.trim() || 'Untagged Hat',
      type: newHatForm.type.trim(),
      color: newHatForm.color.trim(),
      league: newHatForm.league.trim(),
      team: newHatForm.team.trim(),
      occasion: newHatForm.occasion.trim(),
      location: newHatForm.location.trim(),
      year_purchased: newHatForm.yearPurchased,
      rating: newHatForm.rating,
      is_favorite: newHatForm.isFavorite,
      image: permanentImageUrl 
    };

    const { data } = await supabase.from('hats').insert([dbHat] as any).select().single();
    if (data) {
      const frontendHat = { ...dbHat, id: data.id, yearPurchased: data.year_purchased, isFavorite: data.is_favorite };
      setHats([frontendHat, ...hats]); 
    }

    setPendingFiles(pendingFiles.slice(1));
    setPreviewUrls(previewUrls.slice(1));
    setNewHatForm(EMPTY_HAT_FORM); 
    setIsUploading(false);
    if (pendingFiles.length <= 1) setIsModalOpen(false);
  };

  const handleAddAllUntagged = async () => {
    if (pendingFiles.length === 0) return;
    setIsUploading(true);

    const uploadPromises = pendingFiles.map(file => uploadSingleFileToStorage(file));
    const uploadedUrls = await Promise.all(uploadPromises);

    const dbHats = uploadedUrls.map((imgUrl) => ({
      name: 'Untagged Hat', year_purchased: '', type: '', color: '', league: '', team: '', occasion: '', location: '',
      image: imgUrl, rating: 0, is_favorite: false
    }));

    const { data } = await supabase.from('hats').insert(dbHats as any).select();
    if (data) {
      const frontendHats = data.map(h => ({ ...h, yearPurchased: h.year_purchased, isFavorite: h.is_favorite }));
      setHats([...frontendHats, ...hats]);
    }

    setPendingFiles([]);
    setPreviewUrls([]);
    setNewHatForm(EMPTY_HAT_FORM);
    setIsUploading(false);
    setIsModalOpen(false);
  };

  const closeAddHatModal = () => {
    setIsModalOpen(false);
    setPendingFiles([]);
    setPreviewUrls([]);
    setNewHatForm(EMPTY_HAT_FORM);
  };

  const handleSaveEditedHat = async (e: React.FormEvent) => {
    e.preventDefault();
    learnNewCategories(editingHat);

    const dbHat = {
      name: editingHat.name.trim() || 'Untagged Hat',
      type: editingHat.type.trim(),
      color: editingHat.color.trim(),
      league: editingHat.league.trim(),
      team: editingHat.team.trim(),
      occasion: editingHat.occasion.trim(),
      location: editingHat.location.trim(),
      year_purchased: editingHat.yearPurchased,
      rating: editingHat.rating,
      is_favorite: editingHat.isFavorite,
      image: editingHat.image 
    };

    const cleanedFrontendHat = { ...dbHat, id: editingHat.id, yearPurchased: dbHat.year_purchased, isFavorite: dbHat.is_favorite };
    setHats(hats.map(h => h.id === cleanedFrontendHat.id ? cleanedFrontendHat : h));
    if (randomHat && randomHat.id === cleanedFrontendHat.id) setRandomHat(cleanedFrontendHat);
    setEditingHat(null);

    await supabase.from('hats').update(dbHat as any).eq('id', editingHat.id);
  };

  const confirmDeleteHat = async () => {
    if (!hatToDelete) return;
    setHats(hats.filter(h => h.id !== hatToDelete));
    if (randomHat && randomHat.id === hatToDelete) setRandomHat(null);
    const idToDelete = hatToDelete;
    setHatToDelete(null);
    await supabase.from('hats').delete().eq('id', idToDelete);
  };

  // Loading Splash
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center transition-colors duration-300">
        <p className="text-xl font-bold text-slate-400 dark:text-slate-600 animate-pulse">Syncing Hat Trax...</p>
      </div>
    );
  }

  // --- GATEWAY SIGN-IN ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300">
        <form onSubmit={handleAuthSubmit} className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl max-w-sm w-full space-y-4 border dark:border-slate-800 transition-colors">
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 tracking-tight">Hat Trax 🧢</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {authMode === 'login' ? 'Sign in to access your digital closet' : 'Create an account to start your collection'}
            </p>
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Email Address</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium transition-colors" placeholder="collector@email.com" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Password</label>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium transition-colors" placeholder="••••••••" />
          </div>

          <button type="submit" disabled={authLoading} className="w-full bg-indigo-600 dark:bg-indigo-500 text-white font-bold py-2.5 rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-600 shadow-md transition disabled:opacity-50 text-sm">
            {authLoading ? 'Verifying...' : authMode === 'login' ? 'Sign In ➔' : 'Create Account ✨'}
          </button>

          <div className="text-center pt-2 border-t dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 transition-colors">
            {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-indigo-600 dark:text-indigo-400 font-bold underline hover:text-indigo-800 dark:hover:text-indigo-300">
              {authMode === 'login' ? 'Register here' : 'Log in instead'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- CORE APP DASHBOARD ---
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12 text-slate-900 dark:text-slate-100 relative transition-colors duration-300">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b dark:border-slate-800 pb-6 gap-4 transition-colors">
          <div>
            <h1 className="text-4xl font-extrabold text-indigo-600 dark:text-indigo-400 tracking-tight">Hat Trax 🧢</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Logged in as: <span className="font-semibold text-slate-700 dark:text-slate-300">{user.email}</span></p>
          </div>
          <div className="flex flex-wrap gap-3 w-full sm:w-auto">
            <button onClick={toggleDarkMode} className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3 px-4 rounded-xl transition text-sm flex items-center justify-center">
              {isDarkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button onClick={pickRandomHat} className="bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-bold py-3 px-5 rounded-xl shadow-md transition transform hover:scale-105 flex-1 sm:flex-initial text-sm text-center">🎲 Roll</button>
            <button onClick={handleLogout} className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3 px-4 rounded-xl transition text-sm">Log Out</button>
          </div>
        </header>

        {/* INVENTORY SLIDER (CAPPED AT 10 ITEMS) */}
        {sliderHats.length > 0 && (
          <section className="relative w-full h-64 md:h-96 bg-slate-900 dark:bg-black rounded-2xl overflow-hidden shadow-xl group transition-colors">
            {sliderHats.map((hat, index) => (
              <div key={hat.id} className={`absolute inset-0 transition-opacity duration-700 ease-in-out bg-slate-950/40 backdrop-blur-md ${index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                <img src={hat.image} alt={hat.name} className="w-full h-full object-contain relative z-10" />
                <img src={hat.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-sm select-none pointer-events-none" />
                
                <div className="absolute bottom-0 left-0 p-6 md:p-10 w-full bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent flex flex-col justify-end z-20">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{hat.isFavorite ? '❤️' : '🖤'}</span>
                    {hat.rating > 0 && <span className="text-amber-400 text-lg">{'★'.repeat(hat.rating)}</span>}
                  </div>
                  <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-2">{hat.name}</h2>
                  <div className="flex flex-wrap gap-2">
                    {hat.type && <span className="text-xs bg-white/20 text-white px-2 py-1 rounded backdrop-blur-md">{hat.type}</span>}
                    {hat.team && <span className="text-xs bg-white/20 text-white px-2 py-1 rounded backdrop-blur-md">{hat.team}</span>}
                  </div>
                </div>
              </div>
            ))}
            {sliderHats.length > 1 && (
              <>
                <button onClick={() => setCurrentSlide(prev => prev === 0 ? sliderHats.length - 1 : prev - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white p-3 rounded-full backdrop-blur-md transition z-20 opacity-0 group-hover:opacity-100">◀</button>
                <button onClick={() => setCurrentSlide(prev => prev === sliderHats.length - 1 ? 0 : prev + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white p-3 rounded-full backdrop-blur-md transition z-20 opacity-0 group-hover:opacity-100">▶</button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                  {sliderHats.map((_, idx) => (
                    <button key={idx} onClick={() => setCurrentSlide(idx)} className={`w-2 h-2 rounded-full transition ${idx === currentSlide ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/80'}`} />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* Random Highlight Popup */}
        {randomHat && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 relative animate-in fade-in zoom-in duration-300 transition-colors">
            <button onClick={() => setRandomHat(null)} className="absolute top-4 right-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl font-bold">✕</button>
            <img src={randomHat.image} alt={randomHat.name} className="w-32 h-32 object-cover rounded-xl shadow dark:shadow-black/50" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-1 rounded">Today's Pick</span>
                <span className="text-sm">{randomHat.isFavorite ? '❤️' : '🖤'}</span>
                {randomHat.rating > 0 && <span className="text-sm text-amber-500 dark:text-amber-400">{'★'.repeat(randomHat.rating)}</span>}
              </div>
              <h2 className="text-2xl font-bold mt-1 dark:text-white">{randomHat.name}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Located in: <strong className="text-slate-900 dark:text-slate-200">{randomHat.location || 'Unknown'}</strong></p>
            </div>
          </div>
        )}

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Filters Sidebar */}
          <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border dark:border-slate-800 space-y-5 h-fit transition-colors">
            
            {/* Search */}
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search hats, teams..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border dark:border-slate-700 rounded-xl p-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-800 dark:text-white transition-colors"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">🔍</span>
            </div>

            <div className="grid grid-cols-3 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold text-center transition-colors">
              <button onClick={() => setViewMode('all')} className={`py-2 rounded-lg transition ${viewMode === 'all' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>All</button>
              <button onClick={() => setViewMode('favorites')} className={`py-2 rounded-lg transition flex items-center justify-center gap-1 ${viewMode === 'favorites' ? 'bg-white dark:bg-slate-700 shadow text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>❤️ Favs</button>
              <button onClick={() => setViewMode('untagged')} className={`py-2 rounded-lg transition flex items-center justify-center gap-1 ${viewMode === 'untagged' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>🏷️ Un</button>
            </div>

            <div className="flex justify-between items-center border-b dark:border-slate-800 pb-2 pt-2 transition-colors">
              <h3 className="font-bold text-lg dark:text-white">Filters</h3>
              <button onClick={() => setIsCategoryModalOpen(true)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded transition">⚙️ Edit</button>
            </div>
            {Object.keys(selectedFilters).map((categoryKey) => {
              const pluralKey = categoryKey === 'color' ? 'colors' : categoryKey + 's';
              const options = getDropdownOptions(pluralKey, categoryKey);
              return (
                <div key={categoryKey} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{categoryKey}</label>
                  <select value={selectedFilters[categoryKey]} onChange={(e) => setSelectedFilters({...selectedFilters, [categoryKey]: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer dark:text-white transition-colors">
                    <option value="">All {pluralKey}</option>
                    {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              );
            })}
            <button onClick={() => {
              setSelectedFilters({ type: '', color: '', league: '', team: '', occasion: '', location: '' });
              setSearchQuery('');
              setViewMode('all');
            }} className="w-full text-xs text-red-500 dark:text-red-400 font-medium hover:underline text-center pt-2">Clear All</button>
          </section>

          {/* PAGINATED Grid Inventory Display */}
          <section className="md:col-span-3 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xl dark:text-white">
                {viewMode === 'favorites' ? '❤️ Favorites' : viewMode === 'untagged' ? '🏷️ Untagged' : 'Inventory'} ({filteredHats.length})
              </h3>
              <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 border dark:border-slate-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow transition">+ Add Hat</button>
            </div>

            {filteredHats.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 border-dashed transition-colors">
                <p className="text-slate-400 dark:text-slate-500">No hats found matching your selections.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedHats.map((hat) => (
                    <div key={hat.id} onClick={() => setEditingHat(hat)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 overflow-hidden hover:shadow-md hover:ring-2 hover:ring-indigo-400 transition flex flex-col relative cursor-pointer group">
                      <button onClick={(e) => toggleFavorite(hat.id, e)} className={`absolute top-3 left-3 rounded-full w-8 h-8 flex items-center justify-center text-sm backdrop-blur-sm transition z-10 shadow-sm ${hat.isFavorite ? 'bg-white dark:bg-slate-800 scale-110' : 'bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 opacity-60 group-hover:opacity-100 sm:opacity-85'}`}>
                        {hat.isFavorite ? '❤️' : '🖤'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setHatToDelete(hat.id); }} className="absolute top-3 right-3 bg-slate-900/40 dark:bg-slate-900/70 hover:bg-red-500 dark:hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold backdrop-blur-sm transition z-10 opacity-0 group-hover:opacity-100 sm:opacity-100">✕</button>
                      <img src={hat.image} alt={hat.name} className="w-full h-48 object-cover bg-slate-100 dark:bg-slate-800" />
                      <div className="p-4 space-y-2 flex-1 flex flex-col">
                        <div className="flex justify-between items-start">
                          <div className="space-y-0.5">
                            <h4 className="font-bold text-lg leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition dark:text-white">{hat.name}</h4>
                            {hat.rating > 0 && <div className="text-xs text-amber-500 dark:text-amber-400 flex font-serif tracking-tighter">{'★'.repeat(hat.rating)}{'☆'.repeat(5 - hat.rating)}</div>}
                          </div>
                          {hat.yearPurchased && <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap ml-2">{hat.yearPurchased}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-auto pt-2">
                          {hat.type && <span className="text-[11px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">{hat.type}</span>}
                          {hat.team && <span className="text-[11px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">{hat.team}</span>}
                          {hat.league && <span className="text-[11px] bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">{hat.league}</span>}
                          {hat.color && <span className="text-[11px] bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">{hat.color}</span>}
                          {hat.occasion && <span className="text-[11px] bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 px-2 py-0.5 rounded-full font-medium">{hat.occasion}</span>}
                          {hat.location && <span className="text-[11px] bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">{hat.location}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-8 pt-4 border-t dark:border-slate-800 transition-colors">
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-sm font-semibold text-sm disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      ◀ Prev
                    </button>
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-sm font-semibold text-sm disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {/* --- ADD MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 transition-colors">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border dark:border-slate-700 transition-colors">
            <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10 transition-colors">
              <h2 className="text-2xl font-bold dark:text-white">{previewUrls.length > 1 ? `Tagging Hat 1 of ${previewUrls.length}` : 'Add a New Hat'}</h2>
              <button onClick={closeAddHatModal} disabled={isUploading} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl">✕</button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form id="add-hat-form" onSubmit={handleAddHat} className="space-y-4">
                {previewUrls.length === 0 ? (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Upload Photo(s)</label>
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="w-full border dark:border-slate-700 rounded-lg p-2 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-700 dark:file:text-indigo-400 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/50 text-slate-700 dark:text-slate-300 transition-colors" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center p-4 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl transition-colors">
                    <img src={previewUrls[0]} alt="Current Hat" className="h-32 w-32 object-cover rounded-lg shadow-md mb-2" />
                    {previewUrls.length > 1 && <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-3 py-1 rounded-full">{previewUrls.length - 1} more waiting in queue...</p>}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Hat Name</label>
                    <input type="text" value={newHatForm.name} onChange={(e) => setNewHatForm({...newHatForm, name: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" placeholder="e.g., Vintage Dodgers Cap" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Hat Rating</label>
                    <div className="flex gap-1 text-2xl pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setNewHatForm({ ...newHatForm, rating: star })} className={`transition ${star <= newHatForm.rating ? 'text-amber-500 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}>★</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Mark as Favorite?</label>
                    <button type="button" onClick={() => setNewHatForm({ ...newHatForm, isFavorite: !newHatForm.isFavorite })} className={`mt-1 font-bold px-4 py-2 text-sm rounded-lg border transition-colors ${newHatForm.isFavorite ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-500 dark:text-red-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>{newHatForm.isFavorite ? '❤️ Added' : '🖤 Add'}</button>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Year Purchased</label>
                    <input type="number" value={newHatForm.yearPurchased} onChange={(e) => setNewHatForm({...newHatForm, yearPurchased: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" placeholder="YYYY" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Hat Type</label>
                    <input list="types-list" value={newHatForm.type} onChange={(e) => setNewHatForm({...newHatForm, type: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" placeholder="Type or select..." />
                    <datalist id="types-list">{getDropdownOptions('types', 'type').map((t: string) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Color</label>
                    <input list="colors-list" value={newHatForm.color} onChange={(e) => setNewHatForm({...newHatForm, color: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" placeholder="Type or select..." />
                    <datalist id="colors-list">{getDropdownOptions('colors', 'color').map((c: string) => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">League</label>
                    <input list="leagues-list" value={newHatForm.league} onChange={(e) => setNewHatForm({...newHatForm, league: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" placeholder="Type or select..." />
                    <datalist id="leagues-list">{getDropdownOptions('leagues', 'league').map((l: string) => <option key={l} value={l} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Team</label>
                    <input list="teams-list" value={newHatForm.team} onChange={(e) => setNewHatForm({...newHatForm, team: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" placeholder="Type or select..." />
                    <datalist id="teams-list">{getDropdownOptions('teams', 'team').map((t: string) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Occasion</label>
                    <input list="occasions-list" value={newHatForm.occasion} onChange={(e) => setNewHatForm({...newHatForm, occasion: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" placeholder="Type or select..." />
                    <datalist id="occasions-list">{getDropdownOptions('occasions', 'occasion').map((o: string) => <option key={o} value={o} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Location</label>
                    <input list="locations-list" value={newHatForm.location} onChange={(e) => setNewHatForm({...newHatForm, location: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" placeholder="Type or select..." />
                    <datalist id="locations-list">{getDropdownOptions('locations', 'location').map((l: string) => <option key={l} value={l} />)}</datalist>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-6 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center z-10 transition-colors">
              <button type="button" onClick={closeAddHatModal} disabled={isUploading} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition">Cancel</button>
              <div className="flex gap-3">
                {previewUrls.length > 0 && <button type="button" onClick={handleAddAllUntagged} disabled={isUploading} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg shadow-sm transition">{isUploading ? 'Uploading...' : 'Add All Untagged'}</button>}
                <button type="submit" form="add-hat-form" disabled={isUploading} className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-semibold rounded-lg shadow transition">{isUploading ? 'Uploading...' : previewUrls.length > 1 ? 'Save & Next ➔' : 'Save Hat'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {editingHat && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 transition-colors">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border dark:border-slate-700 transition-colors">
            <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10 transition-colors">
              <h2 className="text-2xl font-bold dark:text-white">Edit Hat</h2>
              <button onClick={() => setEditingHat(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl">✕</button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form id="edit-hat-form" onSubmit={handleSaveEditedHat} className="space-y-4">
                <div className="flex flex-col items-center p-4 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl mb-4 transition-colors"><img src={editingHat.image} alt={editingHat.name} className="h-32 w-32 object-cover rounded-lg shadow-md" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Hat Name</label>
                    <input type="text" value={editingHat.name} onChange={(e) => setEditingHat({...editingHat, name: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Hat Rating</label>
                    <div className="flex gap-1 text-2xl pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setEditingHat({ ...editingHat, rating: star })} className={`transition ${star <= editingHat.rating ? 'text-amber-500 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}>★</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Mark as Favorite?</label>
                    <button type="button" onClick={() => setEditingHat({ ...editingHat, isFavorite: !editingHat.isFavorite })} className={`mt-1 font-bold px-4 py-2 text-sm rounded-lg border transition-colors ${editingHat.isFavorite ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-500 dark:text-red-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>{editingHat.isFavorite ? '❤️ Favorite' : '🖤 Add Favorite'}</button>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Year Purchased</label>
                    <input type="number" value={editingHat.yearPurchased || ''} onChange={(e) => setEditingHat({...editingHat, yearPurchased: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 dark:text-white transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Hat Type</label>
                    <input list="edit-types-list" value={editingHat.type || ''} onChange={(e) => setEditingHat({...editingHat, type: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 dark:text-white transition-colors" />
                    <datalist id="edit-types-list">{getDropdownOptions('types', 'type').map((t: string) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Color</label>
                    <input list="edit-colors-list" value={editingHat.color || ''} onChange={(e) => setEditingHat({...editingHat, color: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 dark:text-white transition-colors" />
                    <datalist id="edit-colors-list">{getDropdownOptions('colors', 'color').map((c: string) => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">League</label>
                    <input list="edit-leagues-list" value={editingHat.league || ''} onChange={(e) => setEditingHat({...editingHat, league: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 dark:text-white transition-colors" />
                    <datalist id="edit-leagues-list">{getDropdownOptions('leagues', 'league').map((l: string) => <option key={l} value={l} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Team</label>
                    <input list="edit-teams-list" value={editingHat.team || ''} onChange={(e) => setEditingHat({...editingHat, team: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 dark:text-white transition-colors" />
                    <datalist id="edit-teams-list">{getDropdownOptions('teams', 'team').map((t: string) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Occasion</label>
                    <input list="edit-occasions-list" value={editingHat.occasion || ''} onChange={(e) => setEditingHat({...editingHat, occasion: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 dark:text-white transition-colors" />
                    <datalist id="edit-occasions-list">{getDropdownOptions('occasions', 'occasion').map((o: string) => <option key={o} value={o} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Location</label>
                    <input list="edit-locations-list" value={editingHat.location || ''} onChange={(e) => setEditingHat({...editingHat, location: e.target.value})} className="w-full border dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 dark:text-white transition-colors" />
                    <datalist id="edit-locations-list">{getDropdownOptions('locations', 'location').map((l: string) => <option key={l} value={l} />)}</datalist>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-6 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 z-10 transition-colors">
              <button type="button" onClick={() => setEditingHat(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition">Cancel</button>
              <button type="submit" form="edit-hat-form" className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-semibold rounded-lg shadow transition">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM DELETE MODAL --- */}
      {hatToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[80] p-4 transition-colors">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center border dark:border-slate-700 transition-colors">
            <div className="text-red-500 text-4xl mb-4">🗑️</div>
            <h3 className="text-xl font-bold mb-2 dark:text-white">Delete Hat?</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">Are you sure you want to remove this hat from your inventory? This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setHatToDelete(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition w-full">Cancel</button>
              <button onClick={confirmDeleteHat} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow transition w-full">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MANAGE CATEGORIES MODAL --- */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 transition-colors">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] border dark:border-slate-700 transition-colors">
            <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center transition-colors">
              <h2 className="text-2xl font-bold dark:text-white">Manage Dropdowns</h2>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Select a category to edit:</label>
                <select value={editingCategory} onChange={(e) => setEditingCategory(e.target.value)} className="w-full border dark:border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white font-medium transition-colors">
                  {Object.keys(categories).map(key => <option key={key} value={key}>{key.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Current Options:</label>
                <div className="border dark:border-slate-700 rounded-xl p-2 bg-slate-50 dark:bg-slate-800 min-h-[150px] max-h-[250px] overflow-y-auto space-y-2 transition-colors">
                  {categories[editingCategory]?.map((item: string) => (
                    <div key={item} className="flex justify-between items-center bg-white dark:bg-slate-700 p-3 rounded-lg border dark:border-slate-600 shadow-sm text-sm font-medium dark:text-white transition-colors">
                      <span>{item}</span>
                      <button onClick={() => handleRemoveCategoryItem(item)} className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded transition" title="Remove Option">✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <form onSubmit={handleAddCategoryItem} className="flex gap-2">
                <input type="text" value={newCategoryValue} onChange={(e) => setNewCategoryValue(e.target.value)} placeholder={`Add new ${editingCategory.slice(0, -1)}...`} className="flex-1 border dark:border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:bg-slate-800 dark:text-white transition-colors" />
                <button type="submit" className="bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white px-5 py-3 rounded-lg font-bold shadow transition text-sm whitespace-nowrap">+ Add</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
