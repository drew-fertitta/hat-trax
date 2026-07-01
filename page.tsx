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
  
  const [viewMode, setViewMode] = useState<'all' | 'favorites'>('all');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({
    type: '', color: '', league: '', team: '', occasion: '', location: ''
  });

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
        catData.forEach(c => { dbCategories[c.category_key] = c.options; });
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

  // --- FILTER & RANDOMIZER LOGIC ---
  const filteredHats = hats.filter(hat => {
    if (viewMode === 'favorites' && !hat.isFavorite) return false;
    return Object.keys(selectedFilters).every(key => {
      if (!selectedFilters[key]) return true;
      return (hat as any)[key] === selectedFilters[key];
    });
  });

  useEffect(() => setCurrentSlide(0), [filteredHats.length, selectedFilters, viewMode]);

  const pickRandomHat = () => {
    if (filteredHats.length === 0) return;
    setRandomHat(filteredHats[Math.floor(Math.random() * filteredHats.length)]);
  };

  // CATEGORY SYNC LOGIC (Patched to Insert if missing)
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
      if (typedValue && !updatedCategories[catKey].includes(typedValue)) {
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
    const newOptions = [...categories[editingCategory], newCategoryValue.trim()];
    setCategories({ ...categories, [editingCategory]: newOptions });
    syncCategoryToDB(editingCategory, newOptions);
    setNewCategoryValue('');
  };

  const handleRemoveCategoryItem = (itemToRemove: string) => {
    const newOptions = categories[editingCategory].filter((item: string) => item !== itemToRemove);
    setCategories({ ...categories, [editingCategory]: newOptions });
    syncCategoryToDB(editingCategory, newOptions);
  };

  // FILE UPLOAD AND COMPRESSION PROCESSOR
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
    
    if (pendingFiles.length > 0) {
      permanentImageUrl = await uploadSingleFileToStorage(pendingFiles[0]);
    }

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

  // Loading Splash Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-xl font-bold text-slate-400 animate-pulse">Syncing Hat Trax...</p>
      </div>
    );
  }

  // --- GATEWAY SIGN-IN AUTH SCREEN RENDER LAYER ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <form onSubmit={handleAuthSubmit} className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full space-y-4 border">
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-indigo-600 tracking-tight">Hat Trax 🧢</h1>
            <p className="text-sm text-slate-500 mt-1">
              {authMode === 'login' ? 'Sign in to access your digital closet' : 'Create an account to start your collection'}
            </p>
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-500">Email Address</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-sm font-medium" placeholder="collector@email.com" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-500">Password</label>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-sm font-medium" placeholder="••••••••" />
          </div>

          <button type="submit" disabled={authLoading} className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-xl hover:bg-indigo-700 shadow-md transition disabled:opacity-50 text-sm">
            {authLoading ? 'Verifying...' : authMode === 'login' ? 'Sign In ➔' : 'Create Account ✨'}
          </button>

          <div className="text-center pt-2 border-t text-xs text-slate-500">
            {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-indigo-600 font-bold underline hover:text-indigo-800">
              {authMode === 'login' ? 'Register here' : 'Log in instead'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- CORE APP DASHBOARD SCREEN RENDER LAYER ---
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-12 text-slate-900 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header Dashboard */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-6 gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-indigo-600 tracking-tight">Hat Trax 🧢</h1>
            <p className="text-slate-500 mt-1">Logged in as: <span className="font-semibold text-slate-700">{user.email}</span></p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button onClick={pickRandomHat} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl shadow-md transition transform hover:scale-105 flex-1 sm:flex-initial text-sm text-center">🎲 Roll Random</button>
            <button onClick={handleLogout} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-4 rounded-xl transition text-sm">Log Out</button>
          </div>
        </header>

        {/* INVENTORY SLIDER */}
        {filteredHats.length > 0 && (
          <section className="relative w-full h-64 md:h-96 bg-slate-900 rounded-2xl overflow-hidden shadow-xl group">
            {filteredHats.map((hat, index) => (
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
            {filteredHats.length > 1 && (
              <>
                <button onClick={() => setCurrentSlide(prev => prev === 0 ? filteredHats.length - 1 : prev - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white p-3 rounded-full backdrop-blur-md transition z-20 opacity-0 group-hover:opacity-100">◀</button>
                <button onClick={() => setCurrentSlide(prev => prev === filteredHats.length - 1 ? 0 : prev + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white p-3 rounded-full backdrop-blur-md transition z-20 opacity-0 group-hover:opacity-100">▶</button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                  {filteredHats.slice(0, 10).map((_, idx) => (
                    <button key={idx} onClick={() => setCurrentSlide(idx)} className={`w-2 h-2 rounded-full transition ${idx === currentSlide ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/80'}`} />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* Random Selection Highlight Popup */}
        {randomHat && (
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 relative animate-in fade-in zoom-in duration-300">
            <button onClick={() => setRandomHat(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            <img src={randomHat.image} alt={randomHat.name} className="w-32 h-32 object-cover rounded-xl shadow" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2 py-1 rounded">Today's Pick</span>
                <span className="text-sm">{randomHat.isFavorite ? '❤️' : '🖤'}</span>
                {randomHat.rating > 0 && <span className="text-sm text-amber-500">{'★'.repeat(randomHat.rating)}</span>}
              </div>
              <h2 className="text-2xl font-bold mt-1">{randomHat.name}</h2>
              <p className="text-sm text-slate-600 mt-1">Located in: <strong className="text-slate-900">{randomHat.location || 'Unknown'}</strong></p>
            </div>
          </div>
        )}

        {/* Main Workspace Grid Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Filters Sidebar */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border space-y-4 h-fit">
            <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl text-xs font-bold text-center">
              <button onClick={() => setViewMode('all')} className={`py-2 rounded-lg transition ${viewMode === 'all' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>All Hats</button>
              <button onClick={() => setViewMode('favorites')} className={`py-2 rounded-lg transition flex items-center justify-center gap-1 ${viewMode === 'favorites' ? 'bg-white shadow text-red-500' : 'text-slate-500 hover:text-slate-800'}`}>❤️ Favorites</button>
            </div>

            <div className="flex justify-between items-center border-b pb-2 pt-2">
              <h3 className="font-bold text-lg">Filters</h3>
              <button onClick={() => setIsCategoryModalOpen(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 px-2 py-1 rounded transition">⚙️ Edit Options</button>
            </div>
            {Object.keys(selectedFilters).map((categoryKey) => {
              const pluralKey = categoryKey === 'color' ? 'colors' : categoryKey + 's';
              return (
                <div key={categoryKey} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase text-slate-500">{categoryKey}</label>
                  <select value={selectedFilters[categoryKey]} onChange={(e) => setSelectedFilters({...selectedFilters, [categoryKey]: e.target.value})} className="w-full bg-slate-50 border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                    <option value="">All {pluralKey}</option>
                    {categories[pluralKey]?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              );
            })}
            <button onClick={() => setSelectedFilters({ type: '', color: '', league: '', team: '', occasion: '', location: '' })} className="w-full text-xs text-red-500 font-medium hover:underline text-center pt-2">Clear All Filters</button>
          </section>

          {/* Grid Inventory Cards Display */}
          <section className="md:col-span-3 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xl">{viewMode === 'favorites' ? '❤️ Favorite Hats' : 'Your Inventory'} ({filteredHats.length})</h3>
              <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold py-2 px-4 rounded-lg shadow transition">+ Add New Hat</button>
            </div>

            {filteredHats.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed">
                <p className="text-slate-400">No hats found matching your selections.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredHats.map((hat) => (
                  <div key={hat.id} onClick={() => setEditingHat(hat)} className="bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-md hover:ring-2 hover:ring-indigo-400 transition flex flex-col relative cursor-pointer group">
                    <button onClick={(e) => toggleFavorite(hat.id, e)} className={`absolute top-3 left-3 rounded-full w-8 h-8 flex items-center justify-center text-sm backdrop-blur-sm transition z-10 shadow-sm ${hat.isFavorite ? 'bg-white scale-110' : 'bg-white/80 hover:bg-white opacity-60 group-hover:opacity-100 sm:opacity-85'}`}>
                      {hat.isFavorite ? '❤️' : '🖤'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setHatToDelete(hat.id); }} className="absolute top-3 right-3 bg-slate-900/40 hover:bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold backdrop-blur-sm transition z-10 opacity-0 group-hover:opacity-100 sm:opacity-100">✕</button>
                    <img src={hat.image} alt={hat.name} className="w-full h-48 object-cover bg-slate-100" />
                    <div className="p-4 space-y-2 flex-1 flex flex-col">
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-lg leading-tight group-hover:text-indigo-600 transition">{hat.name}</h4>
                          {hat.rating > 0 && <div className="text-xs text-amber-500 flex font-serif tracking-tighter">{'★'.repeat(hat.rating)}{'☆'.repeat(5 - hat.rating)}</div>}
                        </div>
                        {hat.yearPurchased && <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium whitespace-nowrap ml-2">{hat.yearPurchased}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-auto pt-2">
                        {hat.type && <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{hat.type}</span>}
                        {hat.team && <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{hat.team}</span>}
                        {hat.color && <span className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">{hat.color}</span>}
                        {hat.location && <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">{hat.location}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* --- ADD MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex justify-between items-center bg-white z-10">
              <h2 className="text-2xl font-bold">{previewUrls.length > 1 ? `Tagging Hat 1 of ${previewUrls.length}` : 'Add a New Hat'}</h2>
              <button onClick={closeAddHatModal} disabled={isUploading} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form id="add-hat-form" onSubmit={handleAddHat} className="space-y-4">
                {previewUrls.length === 0 ? (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Upload Photo(s)</label>
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="w-full border rounded-lg p-2 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center p-4 bg-slate-50 border rounded-xl">
                    <img src={previewUrls[0]} alt="Current Hat" className="h-32 w-32 object-cover rounded-lg shadow-md mb-2" />
                    {previewUrls.length > 1 && <p className="text-xs font-semibold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">{previewUrls.length - 1} more waiting in queue...</p>}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Hat Name</label>
                    <input type="text" value={newHatForm.name} onChange={(e) => setNewHatForm({...newHatForm, name: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g., Vintage Dodgers Cap" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Hat Rating</label>
                    <div className="flex gap-1 text-2xl pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setNewHatForm({ ...newHatForm, rating: star })} className={`transition ${star <= newHatForm.rating ? 'text-amber-500' : 'text-slate-300'}`}>★</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Mark as Favorite?</label>
                    <button type="button" onClick={() => setNewHatForm({ ...newHatForm, isFavorite: !newHatForm.isFavorite })} className={`mt-1 font-bold px-4 py-2 text-sm rounded-lg border transition ${newHatForm.isFavorite ? 'bg-red-50 border-red-300 text-red-500' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>{newHatForm.isFavorite ? '❤️ Added' : '🖤 Add'}</button>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Year Purchased</label>
                    <input type="number" value={newHatForm.yearPurchased} onChange={(e) => setNewHatForm({...newHatForm, yearPurchased: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="YYYY" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Hat Type</label>
                    <input list="types-list" value={newHatForm.type} onChange={(e) => setNewHatForm({...newHatForm, type: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white" placeholder="Type or select..." />
                    <datalist id="types-list">{categories.types?.map((t: string) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Color</label>
                    <input list="colors-list" value={newHatForm.color} onChange={(e) => setNewHatForm({...newHatForm, color: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white" placeholder="Type or select..." />
                    <datalist id="colors-list">{categories.colors?.map((c: string) => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Team</label>
                    <input list="teams-list" value={newHatForm.team} onChange={(e) => setNewHatForm({...newHatForm, team: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white" placeholder="Type or select..." />
                    <datalist id="teams-list">{categories.teams?.map((t: string) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Location</label>
                    <input list="locations-list" value={newHatForm.location} onChange={(e) => setNewHatForm({...newHatForm, location: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white" placeholder="Type or select..." />
                    <datalist id="locations-list">{categories.locations?.map((l: string) => <option key={l} value={l} />)}</datalist>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-6 border-t bg-slate-50 flex justify-between items-center z-10">
              <button type="button" onClick={closeAddHatModal} disabled={isUploading} className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg transition">Cancel</button>
              <div className="flex gap-3">
                {previewUrls.length > 0 && <button type="button" onClick={handleAddAllUntagged} disabled={isUploading} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg shadow-sm transition">{isUploading ? 'Uploading...' : 'Add All Untagged'}</button>}
                <button type="submit" form="add-hat-form" disabled={isUploading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow transition">{isUploading ? 'Uploading...' : previewUrls.length > 1 ? 'Save & Next ➔' : 'Save Hat'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {editingHat && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex justify-between items-center bg-white z-10">
              <h2 className="text-2xl font-bold">Edit Hat</h2>
              <button onClick={() => setEditingHat(null)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form id="edit-hat-form" onSubmit={handleSaveEditedHat} className="space-y-4">
                <div className="flex flex-col items-center p-4 bg-slate-50 border rounded-xl mb-4"><img src={editingHat.image} alt={editingHat.name} className="h-32 w-32 object-cover rounded-lg shadow-md" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Hat Name</label>
                    <input type="text" value={editingHat.name} onChange={(e) => setEditingHat({...editingHat, name: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Hat Rating</label>
                    <div className="flex gap-1 text-2xl pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setEditingHat({ ...editingHat, rating: star })} className={`transition ${star <= editingHat.rating ? 'text-amber-500' : 'text-slate-300'}`}>★</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Mark as Favorite?</label>
                    <button type="button" onClick={() => setEditingHat({ ...editingHat, isFavorite: !editingHat.isFavorite })} className={`mt-1 font-bold px-4 py-2 text-sm rounded-lg border transition ${editingHat.isFavorite ? 'bg-red-50 border-red-300 text-red-500' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>{editingHat.isFavorite ? '❤️ Favorite' : '🖤 Add Favorite'}</button>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Year Purchased</label>
                    <input type="number" value={editingHat.yearPurchased || ''} onChange={(e) => setEditingHat({...editingHat, yearPurchased: e.target.value})} className="w-full border rounded-lg p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Hat Type</label>
                    <input list="edit-types-list" value={editingHat.type || ''} onChange={(e) => setEditingHat({...editingHat, type: e.target.value})} className="w-full border rounded-lg p-2 bg-white" />
                    <datalist id="edit-types-list">{categories.types?.map((t: string) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Color</label>
                    <input list="edit-colors-list" value={editingHat.color || ''} onChange={(e) => setEditingHat({...editingHat, color: e.target.value})} className="w-full border rounded-lg p-2 bg-white" />
                    <datalist id="edit-colors-list">{categories.colors?.map((c: string) => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Team</label>
                    <input list="edit-teams-list" value={editingHat.team || ''} onChange={(e) => setEditingHat({...editingHat, team: e.target.value})} className="w-full border rounded-lg p-2 bg-white" />
                    <datalist id="edit-teams-list">{categories.teams?.map((t: string) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Location</label>
                    <input list="edit-locations-list" value={editingHat.location || ''} onChange={(e) => setEditingHat({...editingHat, location: e.target.value})} className="w-full border rounded-lg p-2 bg-white" />
                    <datalist id="edit-locations-list">{categories.locations?.map((l: string) => <option key={l} value={l} />)}</datalist>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-6 border-t bg-slate-50 flex justify-end gap-3 z-10">
              <button type="button" onClick={() => setEditingHat(null)} className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg transition">Cancel</button>
              <button type="submit" form="edit-hat-form" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow transition">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM DELETE MODAL --- */}
      {hatToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="text-red-500 text-4xl mb-4">🗑️</div>
            <h3 className="text-xl font-bold mb-2">Delete Hat?</h3>
            <p className="text-slate-500 mb-6 text-sm">Are you sure you want to remove this hat from your inventory? This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setHatToDelete(null)} className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg transition w-full">Cancel</button>
              <button onClick={confirmDeleteHat} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow transition w-full">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MANAGE CATEGORIES MODAL --- */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-2xl font-bold">Manage Dropdowns</h2>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Select a category to edit:</label>
                <select value={editingCategory} onChange={(e) => setEditingCategory(e.target.value)} className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 font-medium">
                  {Object.keys(categories).map(key => <option key={key} value={key}>{key.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Current Options:</label>
                <div className="border rounded-xl p-2 bg-slate-50 min-h-[150px] max-h-[250px] overflow-y-auto space-y-2">
                  {categories[editingCategory]?.map((item: string) => (
                    <div key={item} className="flex justify-between items-center bg-white p-3 rounded-lg border shadow-sm text-sm font-medium">
                      <span>{item}</span>
                      <button onClick={() => handleRemoveCategoryItem(item)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition" title="Remove Option">✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <form onSubmit={handleAddCategoryItem} className="flex gap-2">
                <input type="text" value={newCategoryValue} onChange={(e) => setNewCategoryValue(e.target.value)} placeholder={`Add new ${editingCategory.slice(0, -1)}...`} className="flex-1 border rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-lg font-bold shadow transition text-sm whitespace-nowrap">+ Add</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}