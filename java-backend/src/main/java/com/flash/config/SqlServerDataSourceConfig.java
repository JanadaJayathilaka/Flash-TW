package com.flash.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

@Configuration
public class SqlServerDataSourceConfig {

    @Value("${sqlserver.jdbc.url}")
    private String url;

    @Value("${sqlserver.jdbc.username}")
    private String username;

    @Value("${sqlserver.jdbc.password}")
    private String password;

    @Value("${sqlserver.jdbc.pool.max-size:10}")
    private int maxPoolSize;

    @Value("${sqlserver.jdbc.pool.connection-timeout:30000}")
    private long connectionTimeout;

    @Bean(name = "sqlServerDataSource")
    public DataSource sqlServerDataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(password);
        config.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
        config.setMaximumPoolSize(maxPoolSize);
        config.setConnectionTimeout(connectionTimeout);
        config.setPoolName("SQLServer-Pool");
        return new HikariDataSource(config);
    }

    @Bean(name = "sqlServerJdbcTemplate")
    public JdbcTemplate sqlServerJdbcTemplate() {
        return new JdbcTemplate(sqlServerDataSource());
    }
}
