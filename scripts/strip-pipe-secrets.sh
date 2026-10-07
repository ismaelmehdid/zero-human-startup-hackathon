#!/usr/bin/env bash
# Git clean filter for .pipe files: reads a pipeline on stdin and writes it to stdout with the string value of
# every "userToken" and "serviceKey" key replaced by "" (the RocketRide canvas writes OAuth tokens there).
# Everything else passes through byte-identical: no JSON parsing or re-formatting. Escaped quotes inside a value
# are handled by matching the whole JSON string: "(?:[^"\\]|\\.)*". Exits non-zero on any read or write error.
#   bash scripts/strip-pipe-secrets.sh < pipelines/hunter.pipe
set -euo pipefail

exec perl -e '
	binmode STDIN;
	binmode STDOUT;
	local $/;
	my $text = <STDIN>;
	die "strip-pipe-secrets: cannot read stdin: $!\n" unless defined $text;
	$text =~ s/("(?:userToken|serviceKey)"\s*:\s*)"(?:[^"\\]|\\.)*"/$1""/gs;
	print STDOUT $text or die "strip-pipe-secrets: cannot write stdout: $!\n";
	close STDOUT or die "strip-pipe-secrets: cannot close stdout: $!\n";
'
