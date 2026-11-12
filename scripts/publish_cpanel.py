"""Publish static files atomically over verified FTPS; retain previous assets.

Open browser tabs still reference immutable chunks from their original release.
Never synchronize deletions or replace the entry page before all files arrive.
"""
import ftplib
import os
from pathlib import Path, PurePosixPath
import ssl


class SessionFTP(ftplib.FTP_TLS):
    def ntransfercmd(self, cmd, rest=None):
        connection, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            connection = self.context.wrap_socket(
                connection, server_hostname=self.host, session=self.sock.session)
        return connection, size


def publish(ftp, root):
    root = Path(root).resolve()
    files = sorted(root.rglob('*'))
    if not (root / 'index.html').is_file() or not any(
            p.is_file() and p.parent.name == 'assets' for p in files):
        raise ValueError('Refusing to publish an incomplete build')
    if any(p.is_symlink() for p in files):
        raise ValueError('Build cannot contain symlinks')
    files = [p for p in files if p.is_file()]
    # HTML entry points are last, with the main entry point published last of all.
    files.sort(key=lambda p: (p.suffix == '.html', p == root / 'index.html', str(p)))
    directories = set()
    home = ftp.pwd()
    for source in files:
        relative = source.relative_to(root).as_posix()
        if '\r' in relative or '\n' in relative:
            raise ValueError('Invalid build filename')
        parent = PurePosixPath(relative).parent
        for directory in reversed([parent, *parent.parents]):
            name = str(directory)
            if name == '.' or name in directories:
                continue
            try:
                ftp.mkd(name)
            except ftplib.error_perm:
                # Confirm an existing directory instead of ignoring permission errors.
                ftp.cwd(name)
                ftp.cwd(home)
            directories.add(name)
        staged = str(parent / ('.' + source.name + '.officehub-upload'))
        with source.open('rb') as content:
            ftp.storbinary('STOR ' + staged, content)
        if ftp.size(staged) != source.stat().st_size:
            raise IOError('Uploaded file size did not match: ' + relative)
        ftp.rename(staged, relative)
        print('Published ' + relative)


def main():
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    with SessionFTP(context=context, timeout=60) as ftp:
        ftp.connect(os.environ['FTP_SERVER'], 21)
        ftp.login(os.environ['FTP_USERNAME'], os.environ['FTP_PASSWORD'])
        ftp.prot_p()
        publish(ftp, 'dist')


if __name__ == '__main__':
    main()
