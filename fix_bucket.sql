-- Corrige la configuración del bucket "adjuntos" si quedó desactualizada
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
where id = 'adjuntos';

-- Verifica que quedó bien (deberías ver los 5 tipos y 10485760)
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'adjuntos';
