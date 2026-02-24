class TuneWebClient < Formula
  desc "Web interface for Tune Server — multi-room music player"
  homepage "https://github.com/renesenses/tune-web-client"
  url "https://github.com/renesenses/tune-web-client/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "" # TODO: fill in after creating the release tarball
  license "MIT"

  depends_on "node@22" => :build

  def install
    system "npm", "ci", "--ignore-scripts"
    system "npm", "run", "build"

    # Install built static files
    (share/"tune-web-client").install Dir["dist/*"]

    # Install nginx config example
    etc.install "nginx/tune-web-client.conf" => "tune-web-client.nginx.conf"
  end

  def caveats
    <<~EOS
      Static files installed to:
        #{share}/tune-web-client/

      To serve with tune-server, set the static files directory to:
        #{share}/tune-web-client/

      To serve with nginx, symlink the config:
        ln -sf #{etc}/tune-web-client.nginx.conf /usr/local/etc/nginx/servers/
        # Then adjust the 'root' path to: #{share}/tune-web-client/

      Or use any static file server:
        npx serve #{share}/tune-web-client/
    EOS
  end

  test do
    assert_predicate share/"tune-web-client/index.html", :exist?
  end
end
