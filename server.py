from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import date, time, datetime, timedelta
from sqlalchemy import text
import logging
import time as systime

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///movietheater.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

logging.basicConfig(level=logging.INFO)

class Movie(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    rating = db.Column(db.String(10), nullable=False)
    length = db.Column(db.Integer, nullable=False)
    release_date = db.Column(db.Date, nullable=False)

class Showtime(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    theater_id = db.Column(db.Integer, nullable=False)
    movie_id = db.Column(db.Integer, db.ForeignKey('movie.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    time = db.Column(db.Time, nullable=False)
    available_seats = db.Column(db.Integer, default=50, nullable=False)  # Maximum 50 seats per showtime
    movie = db.relationship('Movie', backref=db.backref('showtimes', lazy=True))

class Ticket(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    holder_name = db.Column(db.String(100), nullable=False)
    holder_age = db.Column(db.Integer, nullable=False)
    ticket_price = db.Column(db.Float, nullable=False)
    theater_id = db.Column(db.Integer, nullable=False)
    showtime_id = db.Column(db.String, db.ForeignKey('showtime.id'), nullable=False)
    showtime = db.relationship('Showtime', backref=db.backref('tickets', lazy=True))

# Create the database tables and populate with sample data
with app.app_context():
    db.create_all()
    db.session.query(Movie).delete()  # Clear existing movies
    db.session.query(Showtime).delete()  # Clear existing showtimes
    db.session.commit()

    if not Movie.query.first():
        sample_movies = [
            Movie(name='Spider-Man: No Way Home', rating='PG-13', length=148, release_date=date(2021, 12, 17)),
            Movie(name='Oppenheimer', rating='R', length=180, release_date=date(2023, 7, 21)),
            Movie(name='Barbie', rating='PG-13', length=114, release_date=date(2023, 7, 21)),
            Movie(name='Guardians of the Galaxy Vol. 3', rating='PG-13', length=150, release_date=date(2023, 5, 5))
        ]
        db.session.bulk_save_objects(sample_movies)
        db.session.commit()

    if not Showtime.query.first():
        movies = Movie.query.all()
        movie_ids = {movie.name: movie.id for movie in movies}

        current_date = datetime.now().date()
        sample_showtimes = []
        for movie in movies:
            for day_offset in range(3):  # Create showtimes for the next 7 days
                for showtime_hour in [12, 15, 18,]:  # Showtimes at 12:00, 15:00, 18:00, 21:00
                    sample_showtimes.append(
                        Showtime(
                            theater_id=(movie.id % 3) + 1,  # Theater ID cycles through 1, 2, 3
                            movie_id=movie.id,
                            date=current_date + timedelta(days=day_offset),
                            time=time(showtime_hour, 0),
                            available_seats=3
                        )
                    )
        db.session.bulk_save_objects(sample_showtimes)
        db.session.commit()

# Route to get all movies
@app.route('/api/movies', methods=['GET'])
def get_movies():
    movies = Movie.query.all()
    return jsonify([{
        'id': movie.id,
        'name': movie.name,
        'rating': movie.rating,
        'length': movie.length,
        'release_date': movie.release_date.isoformat()
    } for movie in movies])

# Route to get showtimes for a movie
@app.route('/api/showtimes', methods=['GET'])
def get_showtimes():
    movie_id = request.args.get('movie_id')
    showtimes = Showtime.query.filter_by(movie_id=movie_id).all()
    return jsonify([{
        'id': showtime.id,
        'theater_id': showtime.theater_id,
        'movie_id': showtime.movie_id,
        'date': showtime.date.isoformat(),
        'time': showtime.time.strftime('%H:%M'),
        'available_seats': showtime.available_seats
    } for showtime in showtimes])

# Function to calculate ticket price based on age
def calculate_ticket_price(age):
    age = int(age)
    if age <= 12:
        return 10.0
    elif age <= 65:
        return 15.0
    else:
        return 5.0

from sqlalchemy import text

@app.route('/api/tickets', methods=['POST'])
def purchase_ticket():
    data = request.json
    logging.info("Purchasing a ticket with data: %s", data)
    holder_age = data['holder_age']
    ticket_price = calculate_ticket_price(holder_age)

    try:
        # Start transaction (no explicit isolation level needed for SQLite)
        db.session.begin()

        # Lock the showtime row
        showtime = Showtime.query.filter_by(id=data['showtime_id']).with_for_update().first()
        if not showtime or showtime.available_seats <= 0:
            logging.error("No seats available for showtime ID %s", data['showtime_id'])
            db.session.rollback()
            return jsonify({'message': 'No seats available.'}), 400

        # Reduce available seats by 1
        showtime.available_seats -= 1

        # Create the ticket
        new_ticket = Ticket(
            holder_name=data['holder_name'],
            holder_age=holder_age,
            ticket_price=ticket_price,
            theater_id=data['theater_id'],
            showtime_id=data['showtime_id']
        )
        db.session.add(new_ticket)
        db.session.commit()  # Commit transaction
        logging.info("Ticket purchased successfully.")

        return jsonify({'message': 'Ticket purchased successfully', 'ticket_id': new_ticket.id}), 201

    except Exception as e:
        db.session.rollback()
        logging.error("Error purchasing ticket: %s", str(e))
        return jsonify({'message': 'Failed to purchase ticket.'}), 500


# Route to get all tickets
@app.route('/api/tickets', methods=['GET'])
def get_tickets():
    stmt = db.session.execute(text('SELECT * FROM ticket'))
    tickets = [{'id': row[0], 'holder_name': row[1], 'holder_age': row[2], 'ticket_price': row[3], 'theater_id': row[4], 'showtime_id': row[5]} for row in stmt]
    return jsonify(tickets)

# Route to search tickets by holder name
@app.route('/api/tickets/search', methods=['GET'])
def search_tickets():
    holder_name = request.args.get('holder_name')
    if holder_name:
        stmt = db.session.execute(text('SELECT * FROM ticket WHERE holder_name LIKE :holder_name'), {'holder_name': f'%{holder_name}%'})
        tickets = [{'id': row[0], 'holder_name': row[1], 'holder_age': row[2], 'ticket_price': row[3], 'theater_id': row[4], 'showtime_id': row[5]} for row in stmt]
        return jsonify(tickets)
    return jsonify([])

# Route to update holder name or age for a ticket
@app.route('/api/tickets/update/<int:ticket_id>', methods=['PUT'])
def update_ticket(ticket_id):
    data = request.json
    logging.info("Updating ticket with ID %s with data: %s", ticket_id, data)
    ticket = Ticket.query.get(ticket_id)

    if not ticket:
        logging.error("Ticket with ID %s not found", ticket_id)
        return jsonify({'message': 'Ticket not found.'}), 404

    try:
        if 'holder_name' in data:
            ticket.holder_name = data['holder_name']
        if 'holder_age' in data:
            ticket.holder_age = data['holder_age']
            ticket.ticket_price = calculate_ticket_price(data['holder_age'])
        db.session.commit()
        logging.info("Ticket with ID %s updated successfully.", ticket_id)
    except Exception as e:
        db.session.rollback()
        logging.error("Error updating ticket: %s", str(e))
        return jsonify({'message': 'Failed to update ticket.'}), 500

    return jsonify({'message': 'Ticket updated successfully.'})

# Route to delete a ticket and update the available seats
@app.route('/api/tickets/<int:ticket_id>', methods=['DELETE'])
def delete_ticket(ticket_id):
    logging.info("Deleting ticket with ID %s", ticket_id)
    ticket = Ticket.query.get(ticket_id)
    if ticket:
        try:
            # Retrieve the showtime associated with the ticket
            showtime = Showtime.query.filter_by(id=ticket.showtime_id).first()
            if showtime:
                # Increase the available seats by 1
                showtime.available_seats += 1
            
            # Delete the ticket
            db.session.delete(ticket)
            db.session.commit()
            logging.info("Ticket with ID %s deleted successfully and available seats updated.", ticket_id)
        except Exception as e:
            db.session.rollback()
            logging.error("Error deleting ticket: %s", str(e))
            return jsonify({'message': 'Failed to delete ticket.'}), 500

        return jsonify({'message': 'Ticket deleted successfully.'}), 204

    logging.error("Ticket with ID %s not found", ticket_id)
    return jsonify({'message': 'Ticket not found.'}), 404

if __name__ == '__main__':
    app.run(debug=True, port = 3000)