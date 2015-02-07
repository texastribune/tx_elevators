FROM texastribune/gunicorn
MAINTAINER cchang@texastribune.org

RUN sed -i "s/wsgi:application/example_project.wsgi:application/" /etc/supervisor/conf.d/gunicorn.supervisor.conf

ADD . /app
ENV PYTHONPATH /app
RUN pip install --quiet -r requirements.txt
# needed to keep manage.py from trying to import too much
ENV DEBUG 0
RUN python example_project/manage.py collectstatic --noinput
