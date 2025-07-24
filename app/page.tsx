'use client';

import { useState, useEffect, useRef } from 'react';
import YouTube from 'react-youtube';
import mixpanel from 'mixpanel-browser';


export default function Home() {
  const [theme, setTheme] = useState('');
  const [playlist, setPlaylist] = useState<{ title: string; artist: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const players = useRef<any[]>([]);
  const videoRefs = useRef<HTMLDivElement[]>([]);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [readyStates, setReadyStates] = useState<boolean[]>([]);
  const [columns, setColumns] = useState(4);
  const [showCopy, setShowCopy] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);

  // Initialize Mixpanel
  useEffect(() => {
    mixpanel.init(process.env.NEXT_PUBLIC_MIXPANEL_TOKEN!, { debug: true });
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    mixpanel.track('Generate Playlist Clicked', { theme });
    setLoading(true);
    setError('');
    setPlaylist([]);
    setPlayingIndex(null);
    setSelectedIndex(null);
    players.current = [];
    videoRefs.current = [];
    setReadyStates([]);
  
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to generate playlist');
      }
  
      const data = await response.json();
      setPlaylist(data.songs);
      setReadyStates(new Array(data.songs.length).fill(false));
      players.current = new Array(data.songs.length).fill(null);
      videoRefs.current = new Array(data.songs.length).fill(null);
  
      // Show hotkeys popup on first generate
      if (!localStorage.getItem('hasGeneratedPlaylist')) {
        setShowHotkeys(true);
        localStorage.setItem('hasGeneratedPlaylist', 'true');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loading) return;
    mixpanel.track('Load More Clicked', { theme, currentPlaylistSize: playlist.length });
    const oldLength = playlist.length;
    const wasOnButton = selectedIndex === oldLength;
    setLoading(true);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate more songs');
      }

      const data = await response.json();
      const newSongs = data.songs;
      const newLength = oldLength + newSongs.length;
      setPlaylist((prev) => [...prev, ...newSongs]);
      setReadyStates((prev) => [...prev, ...new Array(newSongs.length).fill(false)]);
      players.current = [...players.current, ...new Array(newSongs.length).fill(null)];
      videoRefs.current = [...videoRefs.current, ...new Array(newSongs.length).fill(null)];
      if (wasOnButton) {
        setSelectedIndex(newLength);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getVideoId = (url: string) => {
    const match = url.match(/v=([^&]+)/);
    return match ? match[1] : '';
  };

  const onReady = (event: { target: any }, index: number) => {
    players.current[index] = event.target;
    const newReadyStates = [...readyStates];
    newReadyStates[index] = true;
    setReadyStates(newReadyStates);
  };

  const onStateChange = (event: { target: any; data: number }, index: number) => {
    if (event.data === 1) { // Playing
      setPlayingIndex(index);
      players.current.forEach((player, i) => {
        if (i !== index && player) {
          try {
            player.pauseVideo();
          } catch (e) {
            console.error('Pause error:', e);
          }
        }
      });
    } else if (event.data === 0 && index === playingIndex && index < playlist.length - 1) { // Ended - play next if available
      setPlayingIndex(index + 1);
    }
  };

  const onError = (event: { data: number }, index: number) => {
    if (playingIndex === index && index < playlist.length - 1) {
      setPlayingIndex(index + 1);
    }
  };

  // Track page view on mount
  useEffect(() => {
    mixpanel.track('Page View', { page: 'Home' });
  }, []);

  // Update columns based on screen size
  useEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth < 640) {
        setColumns(1);
      } else if (window.innerWidth < 768) {
        setColumns(2);
      } else {
        setColumns(4);
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Set initial selected index when playlist loads
  useEffect(() => {
    if (playlist.length > 0 && selectedIndex === null) {
      setSelectedIndex(0);
    }
  }, [playlist, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex !== null) {
      let element: HTMLDivElement | null = null;
      if (selectedIndex < playlist.length) {
        element = videoRefs.current[selectedIndex];
      } else {
        element = buttonRef.current;
      }
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }
    }
  }, [selectedIndex, playlist.length]);

  // Handle WASD and space key presses
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore hotkeys if an input element is focused
      if (document.activeElement?.tagName === 'INPUT') return;

      // Track hotkey press with the key as a property
      if (['w', 'a', 's', 'd', ' '].includes(e.key.toLowerCase())) {
        mixpanel.track('Hotkey Pressed', { key: e.key.toLowerCase() });
      }
  
      if (selectedIndex === null) return;
  
      let newIndex = selectedIndex;
      const buttonIndex = playlist.length;
      const isButton = selectedIndex === buttonIndex;
  
      switch (e.key.toLowerCase()) {
        case 'w': // up
          if (isButton) {
            newIndex = playlist.length - 1;
          } else {
            newIndex = Math.max(0, selectedIndex - columns);
          }
          break;
        case 's': // down
          if (isButton) {
            newIndex = selectedIndex;
          } else {
            newIndex = selectedIndex + columns;
            if (newIndex >= playlist.length) {
              newIndex = buttonIndex;
            }
          }
          break;
        case 'a': // left
          if (isButton) {
            newIndex = selectedIndex;
          } else if (selectedIndex % columns > 0) {
            newIndex = selectedIndex - 1;
          }
          break;
        case 'd': // right
          if (isButton) {
            newIndex = selectedIndex;
          } else if (selectedIndex % columns < columns - 1 && selectedIndex + 1 < playlist.length) {
            newIndex = selectedIndex + 1;
          }
          break;
        case ' ': // space
          e.preventDefault();
          if (isButton) {
            loadMore();
          } else {
            const idx = selectedIndex;
            const player = players.current[idx];
            if (!player) {
              console.log('Player not ready');
              return;
            }
            if (playingIndex === idx) {
              try {
                player.pauseVideo();
              } catch (err) {
                console.error('Pause error:', err);
              }
              setPlayingIndex(null);
            } else {
              try {
                player.playVideo();
              } catch (err) {
                console.error('Play error:', err);
              }
              // setPlayingIndex will be set in onStateChange
            }
          }
          return;
        default:
          return;
      }
  
      setSelectedIndex(newIndex);
    };
  
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, playingIndex, columns, playlist.length, loading, theme]);

  // Automatically play the video at the current playingIndex when it changes
  useEffect(() => {
    if (playingIndex !== null) {
      const player = players.current[playingIndex];
      if (player) {
        try {
          player.playVideo();
        } catch (err) {
          console.error('Play error on index change:', err);
        }
      }
    }
  }, [playingIndex]);

  useEffect(() => {
    if (playlist.length > 0 && playlist.length < 12 && !loading) {
      loadMore();
    }
  }, [playlist.length, loading, loadMore]);

  const handleVideoClick = (index: number) => {
    setSelectedIndex(index);
    mixpanel.track('Video Clicked', { videoIndex: index, title: playlist[index]?.title });
    const player = players.current[index];
    if (!player) return;
    if (playingIndex === index) {
      try {
        player.pauseVideo();
      } catch (err) {
        console.error('Pause error:', err);
      }
      setPlayingIndex(null);
    } else {
      try {
        player.playVideo();
        mixpanel.track('Video Clicked');
      } catch (err) {
        console.error('Play error:', err);
      }
    }
  };

  const playlistText = playlist.map((song) => `${song.title} by ${song.artist}`).join('\n');

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-300 via-sky-100 to-white flex flex-col items-center justify-center p-4 md:p-8 text-blue-900">
      <div className="w-full max-w-5xl flex flex-col items-center">
        {playlist.length > 0 ? (
          // Folded layout, centered
          <div className="flex justify-between items-center mb-6 w-full">
            <div className="flex items-center">
              <h1 className="text-3xl font-bold mr-4">Vibe DJ</h1>
              <form onSubmit={handleGenerate} className="flex w-full max-w-md">
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Enter new theme..."
                  className="flex-1 px-4 py-2 bg-white/10 border border-white/30 rounded-l-lg focus:outline-none focus:border-white text-blue-900 placeholder-blue-900/70 text-sm"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-white/20 text-blue-900 rounded-r-lg hover:bg-white/30 disabled:bg-gray-500/50 transition-colors text-sm"
                >
                  {loading ? 'Generating...' : 'Search'}
                </button>
              </form>
            </div>
            <div className="flex">
              <button
                onClick={() => setShowCopy(!showCopy)}
                className="px-4 py-2 bg-white/20 text-blue-900 rounded-lg hover:bg-white/30 transition-colors text-sm"
              >
                Copy Playlist
              </button>
              <button
                onClick={() => setShowHotkeys(!showHotkeys)}
                className="ml-2 px-4 py-2 bg-white/20 text-blue-900 rounded-lg hover:bg-white/30 transition-colors text-sm"
              >
                Hotkeys
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <h1 className="text-6xl font-bold text-blue-900 mb-4">Vibe DJ</h1>
            <p className="text-2xl text-blue-900 max-w-md text-center mb-6">
              Create playlists that match your vibe
            </p>
            <form onSubmit={handleGenerate} className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-xl p-6 shadow-lg">
              <input
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g., top 10 high vibrations 80s music like Guardians of the Galaxy"
                className="w-full px-4 py-3 bg-white/20 border border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 text-blue-900 placeholder-blue-900/70"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 px-4 py-3 bg-white/20 border border-blue-300 text-blue-900 rounded-lg hover:bg-white/30 disabled:bg-gray-500/50 transition-colors"
              >
                {loading ? 'Generating...' : 'Generate Playlist'}
              </button>
              {loading && (
                <div className="mt-2 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-[load-bar_10s_ease-out_forwards]"
                    style={{ width: '0%' }}
                  />
                </div>
              )}
            </form>
          </div>
        )}

        {error && <p className="mt-4 text-red-500 text-center">{error}</p>}

        {showCopy && (
          <div className="fixed top-20 right-10 bg-white/90 p-4 rounded-lg shadow-lg z-50 max-w-sm">
            <textarea
              value={playlistText}
              readOnly
              className="w-full h-32 px-2 py-1 bg-gray-100 border border-gray-300 rounded mb-2 text-blue-900 text-sm"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(playlistText);
                setShowCopy(false);
              }}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
            >
              Copy
            </button>
          </div>
        )}

        {showHotkeys && (
          <div className="fixed top-40 right-10 bg-white/90 p-4 rounded-lg shadow-lg z-50 max-w-sm">
            <button
              onClick={() => setShowHotkeys(false)}
              className="absolute top-2 right-2 text-blue-900 hover:text-blue-600 text-sm font-bold"
            >
              ✕
            </button>
            <p className="text-blue-900 font-bold mb-2">Hotkeys:</p>
            <ul className="list-disc pl-5 text-blue-900 text-sm font-bold">
              <li>W: Move up</li>
              <li>A: Move left</li>
              <li>S: Move down</li>
              <li>D: Move right</li>
              <li>Space: Play/Pause video or Load More (if selected)</li>
            </ul>
          </div>
        )}

        {playlist.length > 0 && (
          <div className="mt-4 w-full">
            <h2 className="text-2xl font-semibold mb-4 text-center">Your Playlist</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
              {playlist.map((song, index) => (
                <div
                  key={index}
                  ref={(el) => (videoRefs.current[index] = el)}
                  onClick={() => handleVideoClick(index)}
                  className={`relative rounded-lg overflow-hidden w-full cursor-pointer ${
                    selectedIndex === index ? 'border-4 border-yellow-400' : ''
                  }`}
                >
                  <YouTube
                    videoId={getVideoId(song.url)}
                    className={`transition-opacity duration-300 ${playingIndex === index ? 'opacity-100' : 'opacity-50'}`}
                    opts={{
                      height: '240',
                      width: '100%',
                      playerVars: {
                        autoplay: 0,
                      },
                    }}
                    onReady={(e) => onReady(e, index)}
                    onStateChange={(e) => onStateChange(e, index)}
                    onError={(e) => onError(e, index)}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-3 text-center text-white text-lg font-bold">
                    {song.title} by {song.artist}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 w-full flex justify-center">
              <div ref={buttonRef} className={`rounded-lg overflow-hidden ${selectedIndex === playlist.length ? 'border-4 border-yellow-400' : ''}`}>
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-20 py-5 text-2xl font-bold bg-sky-200 text-blue-900 border-2 border-blue-300 rounded-lg hover:bg-sky-300 disabled:bg-gray-200 disabled:text-gray-500 transition-colors"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
