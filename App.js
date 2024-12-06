import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css'; // Link to an external CSS file for additional styling

function App() {
  const [movies, setMovies] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState('');
  const [selectedShowtime, setSelectedShowtime] = useState('');
  const [holderName, setHolderName] = useState('');
  const [holderAge, setHolderAge] = useState('');
  const [ticketPrice, setTicketPrice] = useState(0);
  const [searchName, setSearchName] = useState('');
  const [updateTicketId, setUpdateTicketId] = useState(null);
  const [updateHolderName, setUpdateHolderName] = useState('');
  const [updateHolderAge, setUpdateHolderAge] = useState('');
  const [moviesWithShowtimes, setMoviesWithShowtimes] = useState([]);


  useEffect(() => {
    fetchMovies();
    fetchTickets();
  }, []);
  useEffect(() => {
    fetchMoviesWithShowtimes();
    fetchTickets(); // Ensure other data is still fetched
  }, []);
  

  const fetchMovies = async () => {
    try {
      const response = await axios.get('/api/movies');
      setMovies(response.data);
    } catch (error) {
      console.error('Error fetching movies:', error);
    }
  };

  const fetchShowtimes = async (movieId) => {
    try {
      const response = await axios.get('/api/showtimes', { params: { movie_id: movieId } });
      setShowtimes(response.data);
    } catch (error) {
      console.error('Error fetching showtimes:', error);
    }
  };

  const fetchTickets = async () => {
    try {
      const response = await axios.get('/api/tickets');
      setTickets(response.data);
      setSearchResults([]);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };

  const handleMovieChange = (e) => {
    const movieId = e.target.value;
    setSelectedMovie(movieId);
    fetchShowtimes(movieId);
  };

  const calculateTicketPrice = (age) => {
    if (age <= 12) return 10;
    if (age <= 65) return 15;
    return 5;
  };

  const handleAgeChange = (e) => {
    const age = parseInt(e.target.value, 10) || 0;
    setHolderAge(age);
    setTicketPrice(calculateTicketPrice(age));
  };

  const handlePurchaseTicket = async () => {
    if (!selectedShowtime || !holderName || !holderAge) {
      alert('Please fill in all fields before purchasing a ticket.');
      return;
    }
  
    const selectedShowtimeObj = showtimes.find(showtime => showtime.id === parseInt(selectedShowtime));
    if (!selectedShowtimeObj || selectedShowtimeObj.available_seats <= 0) {
      alert('No available seats for this showtime.');
      return;
    }
  
    try {
      const response = await axios.post('/api/tickets', {
        holder_name: holderName,
        holder_age: holderAge,
        theater_id: selectedShowtimeObj.theater_id,
        showtime_id: selectedShowtime,
      });
  
      alert('Ticket purchased successfully: ' + response.data.ticket_id);
  
      // Update moviesWithShowtimes state
      setMoviesWithShowtimes(prevMovies =>
        prevMovies.map(movie => ({
          ...movie,
          showtimes: movie.showtimes.map(showtime =>
            showtime.id === parseInt(selectedShowtime)
              ? { ...showtime, available_seats: showtime.available_seats - 1 }
              : showtime
          ),
        }))
      );
  
      // Reset form fields
      setHolderName('');
      setHolderAge('');
      setSelectedShowtime('');
      setTicketPrice(0);
    } catch (error) {
      console.error('Error purchasing ticket:', error);
      alert('Failed to purchase ticket. Please try again.');
    }
  };
  
  
  
  
  const handleDeleteTicket = async (ticketId) => {
    if (window.confirm('Are you sure you want to delete this ticket?')) {
      try {
        // Fetch the ticket details before deletion to get the showtime ID
        const ticketToDelete = tickets.find(ticket => ticket.id === ticketId);
  
        if (!ticketToDelete) {
          alert('Ticket not found.');
          return;
        }
  
        // Send delete request to the backend
        await axios.delete(`/api/tickets/${ticketId}`);
  
        alert('Ticket deleted successfully.');
  
        // Update moviesWithShowtimes state
        setMoviesWithShowtimes(prevMoviesWithShowtimes =>
          prevMoviesWithShowtimes.map(movie => ({
            ...movie,
            showtimes: movie.showtimes.map(showtime =>
              showtime.id === parseInt(ticketToDelete.showtime_id)
                ? { ...showtime, available_seats: showtime.available_seats + 1 }
                : showtime
            ),
          }))
        );
  
        // Refresh tickets list
        fetchTickets();
      } catch (error) {
        console.error('Error deleting ticket:', error);
        alert('Failed to delete ticket. Please try again.');
      }
    }
  };
  
  const fetchMoviesWithShowtimes = async () => {
    try {
      const moviesResponse = await axios.get('/api/movies');
      const movies = moviesResponse.data;
  
      // Fetch showtimes for each movie
      const moviesWithShowtimes = await Promise.all(
        movies.map(async (movie) => {
          const showtimesResponse = await axios.get('/api/showtimes', { params: { movie_id: movie.id } });
          return {
            ...movie,
            showtimes: showtimesResponse.data,
          };
        })
      );
  
      setMoviesWithShowtimes(moviesWithShowtimes);
    } catch (error) {
      console.error('Error fetching movies and showtimes:', error);
    }
  };
  

  const handleSearch = () => {
    const trimmedSearchName = searchName.trim().toLowerCase(); // Normalize input
    if (trimmedSearchName === '') {
      setSearchResults([]); // Clear search results if search is empty
      return;
    }
  
    // Filter tickets based on holder_name
    const filteredResults = tickets.filter(ticket =>
      ticket.holder_name.toLowerCase().includes(trimmedSearchName)
    );
    setSearchResults(filteredResults); // Update state with filtered tickets
  };
  


  const handleUpdateTicket = async () => {
    if (!updateTicketId || (!updateHolderName && !updateHolderAge)) {
      alert('Please provide ticket ID and at least one field to update.');
      return;
    }
  
    try {
      // Send update request to the backend
      const response = await axios.put(`/api/tickets/update/${updateTicketId}`, {
        holder_name: updateHolderName,
        holder_age: updateHolderAge,
      });
      alert(response.data.message);
  
      // Update both tickets and searchResults locally
      const updateTicketInList = (list) =>
        list.map(ticket =>
          ticket.id === parseInt(updateTicketId)
            ? {
                ...ticket,
                holder_name: updateHolderName || ticket.holder_name,
                holder_age: updateHolderAge || ticket.holder_age,
                ticket_price: updateHolderAge ? calculateTicketPrice(updateHolderAge) : ticket.ticket_price,
              }
            : ticket
        );
  
      setTickets(updateTicketInList(tickets));
      setSearchResults(updateTicketInList(searchResults));
  
      // Reset form fields
      setUpdateTicketId(null);
      setUpdateHolderName('');
      setUpdateHolderAge('');
    } catch (error) {
      console.error('Error updating ticket:', error);
      alert('Failed to update ticket. Please try again.');
    }
  };
  

  return (
    <div className="app-container">
      <h1 className="app-title">Classic Cinemas Movie Theater</h1>

      <div className="form-container">
        <div className="form-section">
          <h2>Select a Movie</h2>
          <select value={selectedMovie} onChange={handleMovieChange} className="styled-select">
            <option value="">-- Select a Movie --</option>
            {movies.map(movie => (
              <option key={movie.id} value={movie.id}>
                {movie.name}
              </option>
            ))}
          </select>
          <h2>Select a Showtime</h2>
            <select value={selectedShowtime} onChange={(e) => setSelectedShowtime(e.target.value)} className="styled-select">
              <option value="">-- Select a Showtime --</option>
              {showtimes.length > 0 ? (
                showtimes.map(showtime => {
                  const showtimeDateTime = new Date(`${showtime.date}T${showtime.time}`);
                  return (
                    <option key={showtime.id} value={showtime.id}>
                      {`${showtimeDateTime.toLocaleString()} - Available Seats: ${showtime.available_seats}`}
                    </option>
                  );
                })
              ) : (
                <option disabled>No showtimes available</option>
              )}
            </select>
          {selectedShowtime && (
            <h3>Available Seats: {showtimes.find(showtime => showtime.id === parseInt(selectedShowtime))?.available_seats}</h3>
          )}
        </div>

        <div className="form-section">
          <h2>Enter Ticket Details</h2>
          <input
            type="text"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            placeholder="Holder Name"
            className="styled-input"
          />
          <input
            type="number"
            value={holderAge}
            onChange={handleAgeChange}
            placeholder="Holder Age"
            className="styled-input"
          />
          <h3>Ticket Price: ${ticketPrice}</h3>
          <button onClick={handlePurchaseTicket} className="styled-button">Purchase Ticket</button>
        </div>

        <div className="form-section">
          <h2>Update Ticket Information</h2>
          <input
            type="number"
            value={updateTicketId}
            onChange={(e) => setUpdateTicketId(e.target.value)}
            placeholder="Ticket ID"
            className="styled-input"
          />
          <input
            type="text"
            value={updateHolderName}
            onChange={(e) => setUpdateHolderName(e.target.value)}
            placeholder="New Holder Name"
            className="styled-input"
          />
          <input
            type="number"
            value={updateHolderAge}
            onChange={(e) => setUpdateHolderAge(e.target.value)}
            placeholder="New Holder Age"
            className="styled-input"
          />
          <button onClick={handleUpdateTicket} className="styled-button">Update Ticket</button>
        </div>
      </div>
      <div className="movie-list-container">
  <h2>Available Movies</h2>
  {movies.length > 0 ? (
    <table className="styled-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Rating</th>
          <th>Length (min)</th>
          <th>Release Date</th>
        </tr>
      </thead>
      <tbody>
        {movies.map(movie => (
          <tr key={movie.id}>
            <td>{movie.id}</td>
            <td>{movie.name}</td>
            <td>{movie.rating}</td>
            <td>{movie.length}</td>
            <td>{new Date(movie.release_date).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p>No movies available.</p>
  )}
</div>

<div className="movies-showtimes-container">
  <h2>Movies and Showtimes</h2>
  {moviesWithShowtimes.length > 0 ? (
    moviesWithShowtimes.map(movie => (
      <div key={movie.id} className="movie-showtimes">
        <h3>{movie.name} ({movie.rating})</h3>
        <p>Length: {movie.length} minutes | Release Date: {new Date(movie.release_date).toLocaleDateString()}</p>
        <h4>Showtimes:</h4>
        {movie.showtimes.length > 0 ? (
          <ul>
            {movie.showtimes.map(showtime => {
              const showtimeDateTime = new Date(`${showtime.date}T${showtime.time}`);
              return (
                <li key={showtime.id}>
                  {showtimeDateTime.toLocaleString()} - Theater: {showtime.theater_id} | Seats: {showtime.available_seats}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No showtimes available for this movie.</p>
        )}
      </div>
    ))
  ) : (
    <p>No movies and showtimes available.</p>
  )}
</div>

      <div className="search-section">
        <h2>Search Tickets by Holder Name</h2>
        <input
          type="text"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="Search by Holder Name"
          className="styled-input"
        />
        <button onClick={handleSearch} className="styled-button">Search</button>
      </div>

      <div className="table-container">
  <h2>Purchased Tickets</h2>
  <table className="styled-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Holder Name</th>
        <th>Holder Age</th>
        <th>Ticket Price</th>
        <th>Theater ID</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {(searchResults.length > 0 ? searchResults : tickets).map(ticket => (
        <tr key={ticket.id}>
          <td>{ticket.id}</td>
          <td>{ticket.holder_name}</td>
          <td>{ticket.holder_age}</td>
          <td>${ticket.ticket_price}</td>
          <td>{ticket.theater_id}</td>
          <td>
            <button onClick={() => handleDeleteTicket(ticket.id)} className="delete-button">Delete</button>
          </td>
        </tr>
      ))}
      {(searchResults.length === 0 && searchName.trim() !== '') && (
        <tr>
          <td colSpan="6">No tickets found for "{searchName}"</td>
        </tr>
      )}
      {(searchResults.length === 0 && tickets.length === 0 && searchName.trim() === '') && (
        <tr>
          <td colSpan="6">No tickets purchased yet</td>
        </tr>
      )}
    </tbody>
  </table>
</div>

    </div>
  );
  
}

export default App;
